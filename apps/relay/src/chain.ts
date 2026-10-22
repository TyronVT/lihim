import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  rpc,
  type Transaction,
} from "@stellar/stellar-sdk";
import { contractErrorCode, isBudgetError, voteArgs } from "./contract.ts";
import type { LihimProof } from "./wire.ts";

/**
 * Everything the HTTP layer needs from the network, behind one interface so
 * tests can run without RPC. Implementations throw only for transport-level
 * failures (RPC unreachable, timeouts); those become 502 not_sent.
 */
export interface VoteChain {
  /** Free dry run: does the contract accept this vote right now? */
  simulateVote(pollId: bigint, proof: LihimProof): Promise<SimOutcome>;
  /** Build, sign, send and wait for the vote transaction. */
  submitVote(pollId: bigint, proof: LihimProof): Promise<SubmitOutcome>;
}

export type SimOutcome =
  | { ok: true }
  | { ok: false; kind: "contract"; code: number }
  | { ok: false; kind: "rejected" } // host rejected for a non-contract reason (bad types, trap)
  | { ok: false; kind: "unavailable" }; // relay-side: budget, archived state needing restore

export type SubmitOutcome =
  | { ok: true; txHash: string }
  | { ok: false; kind: "contract"; code: number }
  | { ok: false; kind: "failed"; txHash?: string };

export type StellarChainOptions = {
  rpcUrl: string;
  networkPassphrase: string;
  pollsContractId: string;
  feeSecret: string;
};

// Transaction validity window. Polling runs past it so that NOT_FOUND at the
// end really means "can never land", which is what 502 not_sent promises.
const TX_TIMEOUT_S = 30;
const POLL_ATTEMPTS = TX_TIMEOUT_S + 15; // one attempt per second
const MAX_BAD_SEQ_RETRIES = 2;

export class StellarVoteChain implements VoteChain {
  readonly #server: rpc.Server;
  readonly #contract: Contract;
  readonly #keypair: Keypair;
  readonly #passphrase: string;
  // Stellar Core accepts one pending tx per source account, so submissions from
  // the single fee account are serialized. This only covers one process; across
  // serverless instances the txBadSeq retry below is the backstop.
  // TODO(M2): channel accounts (N fee-paying sources) if voting bursts queue up.
  #queue: Promise<unknown> = Promise.resolve();

  constructor(opts: StellarChainOptions) {
    this.#server = new rpc.Server(opts.rpcUrl, { allowHttp: opts.rpcUrl.startsWith("http://") });
    this.#contract = new Contract(opts.pollsContractId);
    this.#keypair = Keypair.fromSecret(opts.feeSecret);
    this.#passphrase = opts.networkPassphrase;
  }

  #build(account: Account, pollId: bigint, proof: LihimProof): Transaction {
    return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.#passphrase })
      .addOperation(this.#contract.call("vote", ...voteArgs(pollId, proof)))
      .setTimeout(TX_TIMEOUT_S)
      .build();
  }

  async #simulate(tx: Transaction): Promise<
    { outcome: { ok: true }; sim: rpc.Api.SimulateTransactionSuccessResponse } | { outcome: Exclude<SimOutcome, { ok: true }> }
  > {
    const sim = await this.#server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      const code = contractErrorCode(sim.error);
      if (code !== null) return { outcome: { ok: false, kind: "contract", code } };
      if (isBudgetError(sim.error)) return { outcome: { ok: false, kind: "unavailable" } };
      return { outcome: { ok: false, kind: "rejected" } };
    }
    // TODO(M2): archived poll/nullifier entries need a RestoreFootprint tx. The
    // keeper should prevent this; until then report it as a relay-side failure.
    if (rpc.Api.isSimulationRestore(sim)) return { outcome: { ok: false, kind: "unavailable" } };
    if (!rpc.Api.isSimulationSuccess(sim)) return { outcome: { ok: false, kind: "unavailable" } };
    return { outcome: { ok: true }, sim };
  }

  async simulateVote(pollId: bigint, proof: LihimProof): Promise<SimOutcome> {
    // Simulation ignores the sequence number, so skip the getAccount round trip.
    const tx = this.#build(new Account(this.#keypair.publicKey(), "0"), pollId, proof);
    return (await this.#simulate(tx)).outcome;
  }

  submitVote(pollId: bigint, proof: LihimProof): Promise<SubmitOutcome> {
    const run = this.#queue.then(() => this.#submit(pollId, proof));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #submit(pollId: bigint, proof: LihimProof): Promise<SubmitOutcome> {
    for (let attempt = 0; ; attempt++) {
      const account = await this.#server.getAccount(this.#keypair.publicKey());
      const tx = this.#build(account, pollId, proof);
      // Re-simulate on the real tx: state may have moved during the random delay
      // (e.g. the same vote double-tapped), and we need fresh resource numbers.
      const simulated = await this.#simulate(tx);
      if (!("sim" in simulated)) {
        const { outcome } = simulated;
        return outcome.kind === "contract" ? outcome : { ok: false, kind: "failed" };
      }

      const prepared = rpc.assembleTransaction(tx, simulated.sim).build();
      prepared.sign(this.#keypair);
      const hash = Buffer.from(prepared.hash()).toString("hex");
      let sent: rpc.Api.SendTransactionResponse;
      try {
        sent = await this.#server.sendTransaction(prepared);
      } catch {
        // The request may have reached core before the connection dropped, so
        // "not sent" is not yet known. Treat it as in flight.
        sent = { status: "PENDING", hash, latestLedger: 0, latestLedgerCloseTime: 0 };
      }

      if (sent.status === "ERROR") {
        if (sent.errorResult?.result.type === "txBadSeq" && attempt < MAX_BAD_SEQ_RETRIES) continue;
        return { ok: false, kind: "failed" };
      }
      if (sent.status === "TRY_AGAIN_LATER") return { ok: false, kind: "failed" };

      // PENDING or DUPLICATE: either way the tx is in flight; wait for it.
      const final = await this.#waitFor(sent.hash);
      if (final.status === rpc.Api.GetTransactionStatus.SUCCESS) return { ok: true, txHash: sent.hash };
      if (final.status === rpc.Api.GetTransactionStatus.FAILED) {
        // The result XDR does not carry the contract error code; a fresh dry run
        // tells us whether it lost a race to the same nullifier.
        const again = await this.simulateVote(pollId, proof);
        if (!again.ok && again.kind === "contract") return again;
      }
      return { ok: false, kind: "failed", txHash: sent.hash };
    }
  }

  /**
   * Once a tx is sent, a flaky RPC must not turn into "not sent": it may still
   * land. Keep polling through transport errors until the validity window has
   * certainly passed; only then is NOT_FOUND a real "never recorded".
   */
  async #waitFor(hash: string): Promise<rpc.Api.GetTransactionResponse | { status: "NOT_FOUND" }> {
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      try {
        const res = await this.#server.getTransaction(hash);
        if (res.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) return res;
      } catch {
        // transient; keep polling
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { status: "NOT_FOUND" };
  }
}

// Stellar RPC helpers shared by submit-admin-tx, indexer and keeper.
// Only the ADMIN fee key lives here; the vote fee key is the relay's alone.

import {
  BASE_FEE,
  type FeeBumpTransaction,
  Keypair,
  Operation,
  rpc,
  type Transaction,
  TransactionBuilder,
  xdr,
} from './deps.ts';
import { env, optionalEnv } from './env.ts';

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

export interface StellarConfig {
  server: rpc.Server;
  networkPassphrase: string;
  semaphoreContractId: string;
  pollsContractId: string;
  /** Optional: only the keeper uses it (instance, code and Vk entries). */
  verifierContractId: string | null;
}

/** Env names are the ones contracts/scripts/deploy-testnet.sh prints (INTERFACE.md §1). */
export function stellarConfig(): StellarConfig {
  const rpcUrl = env('STELLAR_RPC_URL');
  return {
    server: new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') }),
    networkPassphrase: optionalEnv('STELLAR_NETWORK_PASSPHRASE', TESTNET_PASSPHRASE),
    semaphoreContractId: env('LIHIM_SEMAPHORE_ID'),
    pollsContractId: env('LIHIM_POLLS_ID'),
    verifierContractId: optionalEnv('LIHIM_VERIFIER_ID', '') || null,
  };
}

/** Fee-payer for admin transactions. Holds XLM, has no role in any contract. */
export function adminFeeKeypair(): Keypair {
  return Keypair.fromSecret(env('ADMIN_FEE_SECRET'));
}

/** Build, simulate (prepareTransaction throws on simulation failure), sign with the fee key. */
export async function buildFeePaidInvocation(
  cfg: StellarConfig,
  fee: Keypair,
  contractId: string,
  fn: string,
  args: xdr.ScVal[],
): Promise<Transaction> {
  const account = await cfg.server.getAccount(fee.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: cfg.networkPassphrase })
    .addOperation(Operation.invokeContractFunction({ contract: contractId, function: fn, args }))
    .setTimeout(60)
    .build();
  const prepared = await cfg.server.prepareTransaction(tx);
  prepared.sign(fee);
  return prepared;
}

export type SubmitOutcome =
  | { status: 'confirmed'; hash: string; returnValue?: xdr.ScVal; ledger: number }
  | { status: 'failed'; hash: string; reason: string }
  | { status: 'submitted'; hash: string }; // still pending when we stopped waiting

/** sendTransaction, then poll getTransaction until it lands or waitMs passes. */
export async function submitAndWait(
  cfg: StellarConfig,
  tx: Transaction | FeeBumpTransaction,
  onSent: (hash: string) => Promise<void> = async () => {},
  waitMs = 25_000,
): Promise<SubmitOutcome> {
  const sent = await cfg.server.sendTransaction(tx);
  const hash = sent.hash;
  if (sent.status === 'ERROR') {
    return { status: 'failed', hash, reason: sent.errorResult?.result.type ?? 'send_error' };
  }
  if (sent.status === 'TRY_AGAIN_LATER') return { status: 'failed', hash, reason: 'try_again_later' };
  await onSent(hash);

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const res = await cfg.server.getTransaction(hash);
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { status: 'confirmed', hash, returnValue: res.returnValue, ledger: res.ledger };
    }
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
      return { status: 'failed', hash, reason: res.resultXdr.result.type };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { status: 'submitted', hash };
}

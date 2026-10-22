/**
 * Web Worker entry: proving takes seconds on low-end phones, so it runs off
 * the main thread. Loaded by `createProver()` from "@lihim/sdk/prover".
 */
import { Identity } from "@semaphore-protocol/identity";
import { serializeProof } from "./encoding.js";
import { NotAMemberError, proveVote } from "./prove.js";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol.js";

// Typed locally instead of pulling the WebWorker lib, which conflicts with DOM.
type WorkerScope = {
  addEventListener(type: "message", fn: (ev: MessageEvent<WorkerRequest>) => void): void;
  postMessage(msg: WorkerResponse): void;
};

export async function handleRequest(req: WorkerRequest): Promise<WorkerResponse> {
  try {
    const proof = await proveVote({
      identity: Identity.import(req.identity),
      commitments: req.commitments.map((c) => BigInt(c)),
      pollId: BigInt(req.pollId),
      choice: req.choice,
      ...(req.snarkArtifacts ? { snarkArtifacts: req.snarkArtifacts } : {}),
    });
    return { id: req.id, ok: true, proof: serializeProof(proof) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return err instanceof NotAMemberError ? { id: req.id, ok: false, error, code: err.code } : { id: req.id, ok: false, error };
  }
}

// Only attach when actually running as a worker (no `document`), so importing
// this module elsewhere (tests, SSR) has no side effects.
const scope = globalThis as unknown as Partial<WorkerScope> & { document?: unknown };
if (typeof scope.addEventListener === "function" && typeof scope.postMessage === "function" && !("document" in scope)) {
  const ws = scope as WorkerScope;
  ws.addEventListener("message", (ev) => {
    void handleRequest(ev.data).then((res) => ws.postMessage(res));
  });
}

import { deserializeProof } from "./encoding.js";
import { NotAMemberError, proveVote, type ProveVoteInput } from "./prove.js";
import type { LihimProof } from "./types.js";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol.js";

export type Prover = {
  prove(input: ProveVoteInput): Promise<LihimProof>;
  /** Stops the worker; pending proofs reject. */
  terminate(): void;
  /** True when proofs run in a Web Worker rather than on the main thread. */
  readonly usesWorker: boolean;
};

export type CreateProverOptions = {
  /** Override the worker URL (e.g. when serving dist/worker.js yourself). */
  workerUrl?: string | URL;
  /** Force the main-thread path (tests, SSR, debugging). */
  disableWorker?: boolean;
};

function mainThreadProver(): Prover {
  return { prove: proveVote, terminate() {}, usesWorker: false };
}

function spawnWorker(url?: string | URL): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    // Literal `new URL("./worker.js", import.meta.url)` is the pattern
    // webpack/Next.js, Vite and esbuild detect to emit the worker chunk.
    return url
      ? new Worker(url, { type: "module" })
      : new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

export function createProver(options: CreateProverOptions = {}): Prover {
  const worker = options.disableWorker ? null : spawnWorker(options.workerUrl);
  if (!worker) return mainThreadProver();

  let nextId = 1;
  const pending = new Map<number, { resolve: (p: LihimProof) => void; reject: (e: Error) => void }>();

  const failAll = (err: Error) => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  worker.addEventListener("message", (ev: MessageEvent<WorkerResponse>) => {
    const res = ev.data;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    if (res.ok) {
      try {
        p.resolve(deserializeProof(res.proof));
      } catch (e) {
        p.reject(e as Error);
      }
    } else {
      p.reject(res.code === "not_member" ? new NotAMemberError() : new Error(res.error));
    }
  });
  worker.addEventListener("error", (ev) => failAll(new Error(ev.message || "Prover worker crashed")));

  return {
    usesWorker: true,
    prove(input) {
      const id = nextId++;
      const req: WorkerRequest = {
        id,
        identity: input.identity.export(),
        commitments: input.commitments.map((c) => c.toString()),
        pollId: input.pollId.toString(),
        choice: input.choice,
        ...(input.snarkArtifacts ? { snarkArtifacts: input.snarkArtifacts } : {}),
      };
      return new Promise<LihimProof>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage(req);
      });
    },
    terminate() {
      worker.terminate();
      failAll(new Error("Prover terminated"));
    },
  };
}

export { NotAMemberError };
export type { ProveVoteInput };

import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { VoteChain } from "./chain.ts";
import { classifyContractError } from "./contract.ts";
import type { VoteLogger } from "./log.ts";
import type { InvalidVoteLimiter } from "./rate-limit.ts";
import { parseVoteBody, type VoteResponse } from "./wire.ts";

export type RelayDeps = {
  chain: VoteChain;
  log: VoteLogger;
  limiter: InvalidVoteLimiter;
  appOrigin: string;
  maxDelayMs: number;
  /** Injected for tests; defaults are Math.random and setTimeout. */
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

// Headers that mean the caller attached an identity. Cookie/Authorization are
// the obvious ones; apikey and x-client-info are what supabase-js adds, which
// would mean the vote was sent through the Supabase client by mistake.
const IDENTITY_HEADERS = ["authorization", "cookie", "apikey", "x-client-info"];

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createApp(deps: RelayDeps): Hono {
  const { chain, log, limiter, appOrigin, maxDelayMs } = deps;
  const random = deps.random ?? Math.random;
  const sleep = deps.sleep ?? defaultSleep;
  const app = new Hono();

  const reply = (c: Context, code: ContentfulStatusCode, body: VoteResponse) => c.json(body, code);

  // No logger middleware, ever: request lines carry IPs and user agents.
  // Hono's default onError prints the error; replace it so nothing request-
  // derived reaches stdout.
  app.onError((_err, c) => {
    log({ outcome: "not_sent:internal" });
    return reply(c, 502, { status: "not_sent" });
  });
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.use(
    "*",
    cors({
      // Echo the origin only when it is the app; anything else gets no CORS
      // header and the browser blocks it.
      origin: (origin) => (origin === appOrigin ? origin : null),
      allowMethods: ["POST", "GET", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      credentials: false,
      maxAge: 600,
    }),
  );

  app.use("*", async (c, next) => {
    for (const h of IDENTITY_HEADERS) {
      if (c.req.header(h) !== undefined) {
        log({ outcome: "invalid:identity_attached" });
        return reply(c, 400, { status: "invalid", reason: "identity_attached" });
      }
    }
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.post(
    "/vote",
    // A real body is ~1.5 KB; anything much larger is not a vote.
    bodyLimit({
      maxSize: 8 * 1024,
      onError: (c) => reply(c, 400, { status: "invalid", reason: "malformed" }),
    }),
    async (c) => {
      if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
        log({ outcome: "invalid:malformed" });
        return reply(c, 400, { status: "invalid", reason: "malformed" });
      }

      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        log({ outcome: "invalid:malformed" });
        return reply(c, 400, { status: "invalid", reason: "malformed" });
      }

      const parsed = parseVoteBody(raw);
      if (!parsed.ok) {
        log({ outcome: `invalid:${parsed.reason}` });
        return reply(c, 400, { status: "invalid", reason: parsed.reason });
      }

      const { pollId, proof } = parsed.value;
      const entry = { poll_id: pollId.toString(), nullifier: proof.nullifier.toString() };

      if (limiter.isBlocked(pollId)) {
        log({ ...entry, outcome: "not_sent:rate_limited" });
        c.header("Retry-After", "60");
        return reply(c, 429, { status: "not_sent", reason: "busy" });
      }

      try {
        const sim = await chain.simulateVote(pollId, proof);
        if (!sim.ok) {
          if (sim.kind === "unavailable") {
            log({ ...entry, outcome: "not_sent:unavailable" });
            return reply(c, 502, { status: "not_sent" });
          }
          const rejection =
            sim.kind === "contract" ? classifyContractError(sim.code) : ({ kind: "invalid", reason: "rejected" } as const);
          if (rejection.kind === "already_answered") {
            log({ ...entry, outcome: "already_answered" });
            return reply(c, 409, { status: "already_answered" });
          }
          limiter.recordInvalid(pollId);
          log({ ...entry, outcome: `invalid:${rejection.reason}` });
          return reply(c, 400, { status: "invalid", reason: rejection.reason });
        }

        // Optional timing protection. The response waits for it on purpose:
        // the client should only say "Recorded" once it actually is.
        if (maxDelayMs > 0) await sleep(Math.floor(random() * (maxDelayMs + 1)));

        const sent = await chain.submitVote(pollId, proof);
        if (sent.ok) {
          log({ ...entry, tx_hash: sent.txHash, outcome: "recorded" });
          return reply(c, 200, { status: "recorded", tx_hash: sent.txHash });
        }
        if (sent.kind === "contract") {
          const rejection = classifyContractError(sent.code);
          if (rejection.kind === "already_answered") {
            log({ ...entry, outcome: "already_answered" });
            return reply(c, 409, { status: "already_answered" });
          }
          log({ ...entry, outcome: `invalid:${rejection.reason}` });
          return reply(c, 400, { status: "invalid", reason: rejection.reason });
        }
        log({ ...entry, ...(sent.txHash ? { tx_hash: sent.txHash } : {}), outcome: "not_sent:failed" });
        return reply(c, 502, { status: "not_sent" });
      } catch {
        // Transport failure talking to RPC. Nothing was recorded (or the tx
        // timed out past its validity window), so the client may retry.
        log({ ...entry, outcome: "not_sent:network" });
        return reply(c, 502, { status: "not_sent" });
      }
    },
  );

  return app;
}

// Wires real dependencies from env. A missing secret fails loudly at startup.
import { createApp } from "./app.ts";
import { StellarVoteChain } from "./chain.ts";
import { loadConfig } from "./config.ts";
import { createLogger } from "./log.ts";
import { createInvalidVoteLimiter } from "./rate-limit.ts";

export function appFromEnv(env: Record<string, string | undefined> = process.env) {
  const cfg = loadConfig(env);
  return {
    cfg,
    app: createApp({
      chain: new StellarVoteChain(cfg),
      log: createLogger(),
      limiter: createInvalidVoteLimiter(cfg.invalidPerPollPerMin),
      appOrigin: cfg.appOrigin,
      maxDelayMs: cfg.maxDelayMs,
    }),
  };
}

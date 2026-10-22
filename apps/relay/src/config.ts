export type RelayConfig = {
  feeSecret: string;
  rpcUrl: string;
  networkPassphrase: string;
  pollsContractId: string;
  appOrigin: string;
  maxDelayMs: number;
  invalidPerPollPerMin: number;
  port: number;
};

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const v = env[key]?.trim();
  if (!v) throw new Error(`relay: missing required env ${key}`);
  return v;
}

function nonNegativeInt(env: Env, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`relay: ${key} must be a non-negative integer`);
  return n;
}

export function loadConfig(env: Env): RelayConfig {
  const appOrigin = required(env, "APP_ORIGIN");
  // An origin is scheme://host[:port] with nothing after it. Rejecting
  // anything else stops "https://lihim.app/" silently never matching.
  if (new URL(appOrigin).origin !== appOrigin) {
    throw new Error(`relay: APP_ORIGIN must be a bare origin like https://lihim.app`);
  }
  return {
    feeSecret: required(env, "RELAY_FEE_SECRET"),
    rpcUrl: required(env, "STELLAR_RPC_URL"),
    networkPassphrase: required(env, "STELLAR_NETWORK_PASSPHRASE"),
    pollsContractId: required(env, "POLLS_CONTRACT_ID"),
    appOrigin,
    maxDelayMs: nonNegativeInt(env, "RELAY_MAX_DELAY_MS", 0),
    invalidPerPollPerMin: nonNegativeInt(env, "RELAY_INVALID_PER_POLL_PER_MIN", 60),
    port: nonNegativeInt(env, "PORT", 8787),
  };
}

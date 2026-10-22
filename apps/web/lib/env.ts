/**
 * Public runtime config. Only NEXT_PUBLIC_* values — this module is imported by client code.
 * Each value is read with a literal `process.env.X` so Next can inline it at build time.
 */
export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  /** Empty → lib/relay.ts uses its in-browser mock. */
  relayUrl: (process.env.NEXT_PUBLIC_RELAY_URL || "").replace(/\/+$/, ""),
  stellarRpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL || "",
  explorerTxUrl: process.env.NEXT_PUBLIC_EXPLORER_TX_URL || "",
  stellarNetworkPassphrase:
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015",
  pollsContractId: process.env.NEXT_PUBLIC_LIHIM_POLLS_CONTRACT_ID || "",
  semaphoreContractId: process.env.NEXT_PUBLIC_LIHIM_SEMAPHORE_CONTRACT_ID || "",
  /**
   * "mock" (default): simulated timing + fake proof (lib/prover.ts).
   * "sdk": real Semaphore proof in a Web Worker via @lihim/sdk/prover.
   * Dev builds also accept `?prover=sdk|mock` on the URL (see lib/prover.ts).
   */
  prover: (process.env.NEXT_PUBLIC_PROVER === "sdk" ? "sdk" : "mock") as "sdk" | "mock",
  /** "mock" (default): lib/data/mock.ts. "supabase": lib/data/supabase.ts. */
  data: (process.env.NEXT_PUBLIC_DATA === "supabase" ? "supabase" : "mock") as "supabase" | "mock",
  devRoutes:
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === "1",
} as const;

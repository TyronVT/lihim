import type { LihimNetwork } from "./types.js";

/**
 * Testnet deployment of 2026-10-24 (contracts/scripts/deploy-testnet.sh, FINALIZE=no,
 * first ledger 5355723). LihimSemaphore and LihimPolls were redeployed the same day with 14-day
 * TTL bumps, and polls with MIN_MEMBERS=2 / FIRST_POLL_ID=1 for browser testing; raise
 * MIN_MEMBERS again before any real use.
 */
export const TESTNET: LihimNetwork = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  semaphoreContractId: "CB6BG5NTMGK2MW33FGA2E4Q3DFU2LE5FPYV5HAJ425ZJX43OLUZRCWJW",
  pollsContractId: "CA2IH7CXYSVVYS6JI3D3XPTXS3F2HH7F64FZNFXSHYAT2T4QU4TR23D6",
  verifierContractId: "CCSRAKPYLQGMKGEFIF36WCKLIUDLCLOCCZ32RMSKKAL3P7FYR3PHS2DD",
};

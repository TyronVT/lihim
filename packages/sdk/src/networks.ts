import type { LihimNetwork } from "./types.js";

/**
 * Testnet RPC and passphrase. Contract ids are filled in after deployment.
 * TODO(M0): set the deployed LihimVerifier / LihimSemaphore / LihimPolls ids.
 */
export const TESTNET: LihimNetwork = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  semaphoreContractId: "",
  pollsContractId: "",
  verifierContractId: "",
};

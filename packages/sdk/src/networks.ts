import type { LihimNetwork } from "./types.js";

/**
 * Testnet deployment of 2026-10-24 (contracts/scripts/deploy-testnet.sh, FINALIZE=no,
 * first ledger 5355723). LihimPolls redeployed the same day with MIN_MEMBERS=2, FIRST_POLL_ID=1
 * for browser testing; raise it again before any real use.
 */
export const TESTNET: LihimNetwork = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  semaphoreContractId: "CD6XGYBIUBYGMCTZ4SGRATR3525QEPNYFEHT7S5VG2PH7AMI7AQKUQ23",
  pollsContractId: "CCXPXK6BR66HAMWMMEXKKYNX6GF6QUIMHLEMRKYGLVTWPF5MVOUGZF5T",
  verifierContractId: "CCSRAKPYLQGMKGEFIF36WCKLIUDLCLOCCZ32RMSKKAL3P7FYR3PHS2DD",
};

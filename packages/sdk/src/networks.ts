import type { LihimNetwork } from "./types.js";

/**
 * Testnet deployment of 2026-10-24 (contracts/scripts/deploy-testnet.sh, FINALIZE=no,
 * MIN_MEMBERS=8, FIRST_POLL_ID=1, first ledger 5355723).
 */
export const TESTNET: LihimNetwork = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  semaphoreContractId: "CD6XGYBIUBYGMCTZ4SGRATR3525QEPNYFEHT7S5VG2PH7AMI7AQKUQ23",
  pollsContractId: "CALRV4VKB3DU323TGKPPL7Z6OZE65ACHVGR7XO2LDA7V2FEEOQUKF6D6",
  verifierContractId: "CCSRAKPYLQGMKGEFIF36WCKLIUDLCLOCCZ32RMSKKAL3P7FYR3PHS2DD",
};

/**
 * Where the per-group keys come from (spec: identity = HKDF(passkey PRF output, group)).
 *
 *   prf_out  = WebAuthn PRF(passkey, sha256("lihim/v1"))       — @lihim/sdk getPrfOutput
 *   identity = deriveGroupIdentity(prf_out, groups.id)        — "lihim/sem/" + uuid (D1)
 *   admin    = deriveAdminKey(prf_out, groups.id)             — "lihim/admin/" + uuid (D1)
 *
 * `prf_out` lives only in this module's memory for the tab's lifetime. It is never stored,
 * logged or sent anywhere.
 *
 * Passkey sign-in isn't built yet, so outside production this hands out a FIXED, PUBLIC,
 * DEV-ONLY PRF output (DEV_MOCK_PRF_OUTPUT below). Anyone can derive every identity from it:
 * it exists only so the mock data layer can include "the viewer" in a poll's frozen member set
 * and a real proof can be generated in the browser during development.
 *
 * The SDK is loaded lazily (it pulls in the Semaphore + Stellar libraries), so the mock path
 * never ships it.
 */
import type { AdminKey, Identity } from "@lihim/sdk";

/**
 * DEV ONLY — NOT A SECRET. 32 fixed bytes standing in for a passkey's PRF output.
 * Never used in production builds (see getPrfOutput).
 */
export const DEV_MOCK_PRF_OUTPUT: Uint8Array = Uint8Array.from(
  "lihim-dev-mock-prf-output-v1-xxx",
  (c) => c.charCodeAt(0),
);

export class PasskeyRequiredError extends Error {
  constructor() {
    super("Passkey sign-in is required to derive your group identity");
    this.name = "PasskeyRequiredError";
  }
}

let prfOut: Uint8Array | null = null;

const devPrfAllowed = () => process.env.NODE_ENV !== "production";

/**
 * Called by the (future) passkey sign-in with the PRF output of the same biometric prompt.
 * TODO(M0): wire from the auth-passkey login flow (`getPrfOutput` from @lihim/sdk, with the
 * server challenge) once passkeys are built; clear on sign-out.
 */
export function setPrfOutput(bytes: Uint8Array | null): void {
  prfOut = bytes ? bytes.slice() : null;
}

/** The in-memory PRF output, or the dev mock outside production. */
export async function getPrfOutput(): Promise<Uint8Array> {
  if (prfOut) return prfOut;
  if (devPrfAllowed()) return DEV_MOCK_PRF_OUTPUT;
  // TODO(M0): prompt for the passkey here (getPrfOutput from @lihim/sdk) instead of failing.
  throw new PasskeyRequiredError();
}

let sdkPromise: Promise<typeof import("@lihim/sdk")> | null = null;
/** Lazily loaded @lihim/sdk (one chunk per tab). */
export function loadSdk(): Promise<typeof import("@lihim/sdk")> {
  sdkPromise ??= import("@lihim/sdk");
  return sdkPromise;
}

/** Per-group Semaphore identity. `groupId` is Supabase groups.id (uuid), D1. */
export async function groupIdentity(groupId: string, prf?: Uint8Array): Promise<Identity> {
  const [sdk, bytes] = await Promise.all([loadSdk(), prf ? Promise.resolve(prf) : getPrfOutput()]);
  return sdk.deriveGroupIdentity(bytes, groupId);
}

/** Per-group Ed25519 admin key. Derived from groups.id (D1); signs over the on-chain group id. */
export async function groupAdminKey(groupId: string): Promise<AdminKey> {
  const [sdk, bytes] = await Promise.all([loadSdk(), getPrfOutput()]);
  return sdk.deriveAdminKey(bytes, groupId);
}

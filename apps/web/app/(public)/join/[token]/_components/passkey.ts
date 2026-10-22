/**
 * Passkey step of the join flow — MOCKED.
 *
 * TODO(M0): replace `unlockGroupIdentity` with the real ceremony (lihim-SPEC.md → Identity
 * and keys; build contract §6):
 *   1. navigator.credentials.get (or .create for a first-time user) with
 *      extensions: { prf: { eval: { first: sha256("lihim/v1") } } } — the same prompt also
 *      signs in to Supabase (native passkeys or the `auth-passkey` Edge Function).
 *   2. sem_priv = HKDF-SHA256(ikm = prf_out, salt = empty, info = "lihim/sem/" + groupId, 32)
 *      where groupId is the OFF-CHAIN Supabase groups.id (uuid string), per orchestrator D1 —
 *      never the on-chain u64 (unknown until create_group lands).
 *      → Semaphore Identity(privateKey) → commitment (via @lihim/sdk).
 *   3. Redeem the invite sending ONLY the commitment; prf_out and sem_priv never leave the device.
 *   Fallback when PRF is unsupported (random identity + recovery code) is decided in M0.
 */

import { PasskeyCancelledError, PasskeyUnsupportedError } from "@/lib/data/errors";
import { passkeysAvailable } from "@/lib/passkey";

// Shared with L0 (lib/data/errors.ts), so `instanceof` works the same for repo.signUp/signIn.
export { PasskeyCancelledError, PasskeyUnsupportedError, passkeysAvailable };

const MOCK_PROMPT_MS = 800;

/**
 * Mock: pretends the user approved the passkey prompt. Rejects with PasskeyUnsupportedError
 * when the browser has no WebAuthn, so that branch of the UI is exercised for real.
 */
export async function unlockGroupIdentity(_groupId: string): Promise<void> {
  if (!passkeysAvailable()) throw new PasskeyUnsupportedError();
  await new Promise((r) => setTimeout(r, MOCK_PROMPT_MS));
  // Real implementation maps DOMException "NotAllowedError" → PasskeyCancelledError.
}

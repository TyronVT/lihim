import { ed25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { Identity } from "@semaphore-protocol/identity";

const utf8 = (s: string) => new TextEncoder().encode(s);
const EMPTY = new Uint8Array(0);

/** PRF evaluation input. Fixed forever: changing it orphans every identity. */
export const PRF_SALT: Uint8Array = sha256(utf8("lihim/v1"));

export type PrfResult = {
  prfOutput: Uint8Array;
  credential: PublicKeyCredential;
};

/**
 * Run `navigator.credentials.get` with the WebAuthn PRF extension and return
 * the 32-byte PRF output. Browser only. `prfOutput` must never leave the
 * device; callers should keep it in memory and derive per-group keys from it.
 *
 * The same call can carry a server challenge so one biometric prompt covers
 * both app sign-in and identity derivation.
 *
 * TODO(M0): confirm PRF availability and output stability on Android Chrome
 * and iOS Safari with a synced passkey (M0 acceptance test 6), and decide the
 * fallback for authenticators without PRF.
 */
export async function getPrfOutput(
  credentialOptions: PublicKeyCredentialRequestOptions,
  signal?: AbortSignal,
): Promise<PrfResult> {
  if (typeof navigator === "undefined" || !navigator.credentials) {
    throw new Error("WebAuthn is not available in this environment");
  }
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...credentialOptions,
    extensions: {
      ...credentialOptions.extensions,
      prf: { eval: { first: PRF_SALT as BufferSource } },
    } as AuthenticationExtensionsClientInputs,
  };
  const credential = (await navigator.credentials.get({
    publicKey,
    ...(signal ? { signal } : {}),
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("No credential returned");

  const ext = credential.getClientExtensionResults() as {
    prf?: { enabled?: boolean; results?: { first?: BufferSource } };
  };
  const first = ext.prf?.results?.first;
  if (!first) throw new PrfUnsupportedError();
  const bytes =
    first instanceof ArrayBuffer
      ? new Uint8Array(first)
      : new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
  return { prfOutput: bytes.slice(), credential };
}

export class PrfUnsupportedError extends Error {
  constructor() {
    super("This passkey does not support the PRF extension");
    this.name = "PrfUnsupportedError";
  }
}

function assertPrf(prfOut: Uint8Array) {
  if (!(prfOut instanceof Uint8Array) || prfOut.length < 32) {
    throw new TypeError("prfOut must be at least 32 bytes");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Canonical text form of the off-chain group id (Supabase `groups.id`) as it
 * goes into HKDF info: lowercase, hyphenated 8-4-4-4-12, exactly as Postgres
 * prints a uuid. Uppercase input is lowercased; anything else is rejected so
 * two spellings of one group can never derive two identities.
 *
 * This is NOT the on-chain u64 group id (D1): keys are derived before
 * `create_group` assigns that, and stay the same if it has to be retried.
 */
export function canonicalGroupUuid(groupUuid: string): string {
  if (typeof groupUuid !== "string") throw new TypeError("groupUuid must be a uuid string");
  const v = groupUuid.toLowerCase();
  if (!UUID.test(v)) throw new TypeError("groupUuid must be a hyphenated uuid (groups.id), not the on-chain id");
  return v;
}

/** Fresh `groups.id` for a new group, generated in the browser before `create_group`. */
export function newGroupUuid(): string {
  return globalThis.crypto.randomUUID();
}

function groupInfo(prefix: "lihim/sem/" | "lihim/admin/", groupUuid: string): Uint8Array {
  return utf8(prefix + canonicalGroupUuid(groupUuid));
}

/**
 * 32-byte per-group Semaphore private key:
 * HKDF-SHA256(prfOut, salt = empty, info = "lihim/sem/" + groups.id, 32).
 * Exposed for testing and workers.
 */
export function deriveGroupSecret(prfOut: Uint8Array, groupUuid: string): Uint8Array {
  assertPrf(prfOut);
  return hkdf(sha256, prfOut, EMPTY, groupInfo("lihim/sem/", groupUuid), 32);
}

/**
 * Deterministic Semaphore identity for one group (`groupUuid` = Supabase
 * `groups.id`). A fresh identity per group keeps a person's commitments
 * unlinkable across groups.
 */
export function deriveGroupIdentity(prfOut: Uint8Array, groupUuid: string): Identity {
  return new Identity(deriveGroupSecret(prfOut, groupUuid));
}

export type AdminKey = {
  publicKey: Uint8Array;
  sign(msg: Uint8Array): Uint8Array;
};

/**
 * Per-group Ed25519 admin key:
 * seed = HKDF-SHA256(prfOut, salt = empty, info = "lihim/admin/" + groups.id, 32).
 * The seed never leaves this closure. It signs digests over the ON-CHAIN
 * group id (see `adminMessage`), but is derived from the off-chain uuid.
 */
export function deriveAdminKey(prfOut: Uint8Array, groupUuid: string): AdminKey {
  assertPrf(prfOut);
  return adminKeyFromSeed(hkdf(sha256, prfOut, EMPTY, groupInfo("lihim/admin/", groupUuid), 32));
}

/** Admin key from a raw 32-byte Ed25519 seed (scripts, tests, test vectors). */
export function adminKeyFromSeed(seed: Uint8Array): AdminKey {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) throw new TypeError("seed must be 32 bytes");
  const sk = seed.slice();
  const publicKey = ed25519.getPublicKey(sk);
  return {
    publicKey,
    sign: (msg) => ed25519.sign(msg, sk),
  };
}

export function verifyAdminSignature(
  sig: Uint8Array,
  msg: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  return ed25519.verify(sig, msg, publicKey);
}

export { Identity };

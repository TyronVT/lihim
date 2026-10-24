/**
 * The passkey ceremony for NEXT_PUBLIC_DATA=supabase (P1, lihim-SPEC.md → App login): the
 * `auth-passkey` Edge Function runs the WebAuthn side, and the browser asks for the PRF
 * extension in the SAME prompt, so one Face ID / fingerprint signs in and unlocks the group
 * identities (lib/identity.ts).
 *
 *   sign in:  login/options → navigator.credentials.get (+ prf.eval) → login/verify → { session }
 *   sign up:  register/options → navigator.credentials.create (+ prf) → register/verify → { session }
 *
 * Privacy: prf_out NEVER leaves this module except into lib/identity.ts's memory. The extension
 * results are stripped from the response JSON before it is sent (`clientExtensionResults: {}`).
 *
 * No @simplewebauthn/browser on purpose (no new packages): the JSON ↔ binary mapping below is the
 * small part of it this flow needs.
 */
import { env } from "./env";
import { loadSdk } from "./identity";
import { PasskeyCancelledError, PasskeyNotFoundError, PasskeyUnsupportedError } from "./data/errors";

export interface PasskeySession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user_id: string;
}

export interface PasskeyResult {
  session: PasskeySession;
  /** 32 bytes. Hand straight to setPrfOutput; never store or send. */
  prfOutput: Uint8Array;
}

/** WebAuthn present at all. PRF support is only known from the ceremony result. */
export function passkeysAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toB64url(buf: ArrayBuffer | ArrayBufferView): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Options JSON (SimpleWebAuthn server output) → WebAuthn API shapes
// ---------------------------------------------------------------------------

interface CredentialDescriptorJSON {
  id: string;
  type: PublicKeyCredentialType;
  transports?: AuthenticatorTransport[];
}

interface RequestOptionsJSON {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: CredentialDescriptorJSON[];
  userVerification?: UserVerificationRequirement;
}

interface CreationOptionsJSON {
  rp: PublicKeyCredentialRpEntity;
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  excludeCredentials?: CredentialDescriptorJSON[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
}

const descriptor = (d: CredentialDescriptorJSON): PublicKeyCredentialDescriptor => ({
  id: fromB64url(d.id),
  type: d.type,
  ...(d.transports ? { transports: d.transports } : {}),
});

function requestOptions(o: RequestOptionsJSON): PublicKeyCredentialRequestOptions {
  return {
    challenge: fromB64url(o.challenge),
    timeout: o.timeout,
    rpId: o.rpId,
    allowCredentials: o.allowCredentials?.map(descriptor),
    userVerification: o.userVerification,
  };
}

function creationOptions(o: CreationOptionsJSON, prfSalt: Uint8Array<ArrayBuffer>): PublicKeyCredentialCreationOptions {
  return {
    rp: o.rp,
    user: { id: fromB64url(o.user.id), name: o.user.name, displayName: o.user.displayName },
    challenge: fromB64url(o.challenge),
    pubKeyCredParams: o.pubKeyCredParams,
    timeout: o.timeout,
    excludeCredentials: o.excludeCredentials?.map(descriptor),
    authenticatorSelection: o.authenticatorSelection,
    attestation: o.attestation,
    // Ask for PRF at creation; some authenticators evaluate it right away, others only on get().
    extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
  };
}

// ---------------------------------------------------------------------------
// Credential → response JSON (extension results deliberately dropped)
// ---------------------------------------------------------------------------

function authenticationJSON(cred: PublicKeyCredential) {
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: toB64url(r.clientDataJSON),
      authenticatorData: toB64url(r.authenticatorData),
      signature: toB64url(r.signature),
      userHandle: r.userHandle ? toB64url(r.userHandle) : undefined,
    },
    // NEVER the PRF results: prf_out must not reach any server.
    clientExtensionResults: {},
  };
}

function registrationJSON(cred: PublicKeyCredential) {
  const r = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: toB64url(r.clientDataJSON),
      attestationObject: toB64url(r.attestationObject),
      transports: typeof r.getTransports === "function" ? r.getTransports() : undefined,
    },
    clientExtensionResults: {},
  };
}

type PrfExtension = { enabled?: boolean; results?: { first?: BufferSource } };

function prfBytes(first: BufferSource): Uint8Array {
  const bytes = first instanceof ArrayBuffer ? new Uint8Array(first) : new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
  return bytes.slice();
}

// ---------------------------------------------------------------------------
// Edge Function + error mapping
// ---------------------------------------------------------------------------

class AuthPasskeyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthPasskeyError";
  }
}

async function callAuth<T>(body: Record<string, unknown>): Promise<T> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for passkey sign-in");
  }
  const res = await fetch(`${env.supabaseUrl}/functions/v1/auth-passkey`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: env.supabaseAnonKey },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new AuthPasskeyError(
      res.status,
      typeof data.status === "string" ? data.status : "error",
      typeof data.reason === "string" ? data.reason : `HTTP ${res.status}`,
    );
  }
  return data as T;
}

/** Map browser / server failures onto the three errors screens know (lib/data/errors.ts). */
async function mapErrors<T>(fn: () => Promise<T>): Promise<T> {
  if (!passkeysAvailable()) throw new PasskeyUnsupportedError();
  const sdk = await loadSdk();
  try {
    return await fn();
  } catch (e) {
    if (e instanceof sdk.PrfUnsupportedError) throw new PasskeyUnsupportedError(e.message);
    // Dismissed prompt, timeout, or no matching passkey picked: WebAuthn reports all as NotAllowedError.
    if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError")) {
      throw new PasskeyCancelledError(e.message);
    }
    if (e instanceof DOMException && e.name === "NotSupportedError") throw new PasskeyUnsupportedError(e.message);
    if (e instanceof AuthPasskeyError && e.code === "unknown_credential") throw new PasskeyNotFoundError(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Ceremonies
// ---------------------------------------------------------------------------

/** One prompt: sign in + PRF. */
export function passkeySignIn(): Promise<PasskeyResult> {
  return mapErrors(async () => {
    const sdk = await loadSdk();
    const start = await callAuth<{ challenge_id: string; options: RequestOptionsJSON }>({ action: "login/options" });
    // getPrfOutput adds prf.eval.first = sha256("lihim/v1") and throws PrfUnsupportedError without it.
    const { prfOutput, credential } = await sdk.getPrfOutput(requestOptions(start.options));
    const done = await callAuth<{ session: PasskeySession }>({
      action: "login/verify",
      challenge_id: start.challenge_id,
      response: authenticationJSON(credential),
    });
    return { session: done.session, prfOutput };
  });
}

/** A passkey of the signed-in user, as passkey_credentials stores it. */
export interface OwnCredential {
  /** base64url */
  credential_id: string;
  transports: string[];
}

/**
 * Get prf_out back after a reload (the session survived, the PRF output didn't). Local only:
 * no server challenge and nothing is sent, the assertion is discarded. Limited to the signed-in
 * user's own passkeys, so another account's passkey synced to the same device (or a shared one)
 * can't be picked and silently derive the wrong identities.
 */
export function passkeyUnlock(credentials: OwnCredential[]): Promise<Uint8Array> {
  return mapErrors(async () => {
    const sdk = await loadSdk();
    const { prfOutput } = await sdk.getPrfOutput({
      challenge: crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32))),
      allowCredentials: credentials.map((c) => ({
        id: fromB64url(c.credential_id),
        type: "public-key" as const,
        transports: c.transports as AuthenticatorTransport[],
      })),
      userVerification: "required",
    });
    return prfOutput;
  });
}

/**
 * Create the passkey and the account. Usually one prompt; authenticators that only report
 * `prf.enabled` at creation need a second get() prompt for the PRF output.
 * PRF support is checked BEFORE register/verify, so an unsupported passkey creates no account.
 */
export function passkeySignUp(displayName: string): Promise<PasskeyResult> {
  return mapErrors(async () => {
    const sdk = await loadSdk();
    const start = await callAuth<{ challenge_id: string; options: CreationOptionsJSON; prf_salt: string }>({
      action: "register/options",
      display_name: displayName,
    });
    const prfSalt = fromB64url(start.prf_salt);
    const credential = (await navigator.credentials.create({
      publicKey: creationOptions(start.options, prfSalt),
    })) as PublicKeyCredential | null;
    if (!credential) throw new PasskeyCancelledError();

    const prf = (credential.getClientExtensionResults() as { prf?: PrfExtension }).prf;
    if (!prf?.results?.first && !prf?.enabled) throw new PasskeyUnsupportedError();

    const done = await callAuth<{ session: PasskeySession }>({
      action: "register/verify",
      challenge_id: start.challenge_id,
      response: registrationJSON(credential),
    });

    let prfOutput = prf.results?.first ? prfBytes(prf.results.first) : null;
    if (!prfOutput) {
      // Second prompt, local only (no server challenge needed): evaluate PRF on the new passkey.
      const challenge = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
      const res = await sdk.getPrfOutput({
        challenge,
        rpId: start.options.rp.id,
        allowCredentials: [{ id: credential.rawId, type: "public-key" }],
        userVerification: "required",
      });
      prfOutput = res.prfOutput;
    }
    return { session: done.session, prfOutput };
  });
}

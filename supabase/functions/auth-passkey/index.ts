// auth-passkey: passkey sign-up / sign-in with SimpleWebAuthn, then a normal
// Supabase session for the user.
//
// TODO(M0): if Supabase Auth supports passkey sign-in natively (with the PRF
// extension usable in the same ceremony), switch to it and delete this
// function, passkey_credentials and webauthn_challenges.
//
// Session minting: the passkey is the only credential, so each account gets a
// synthetic, undeliverable email (<uuid>@PASSKEY_EMAIL_DOMAIN). After the
// WebAuthn assertion is verified we ask the admin API for a magic-link token
// for that address and immediately exchange it for a session server-side. No
// email is ever sent; the browser receives { access_token, refresh_token } and
// calls supabase.auth.setSession(). Refresh works like any other session.
// TODO(M0): confirm GoTrue accepts the .invalid domain and that verifyOtp with
// type 'magiclink' + token_hash still mints a session on the current Auth version.
//
// PRF: the browser adds `extensions.prf.eval.first = sha256("lihim/v1")` to the
// options before calling navigator.credentials.get(), so sign-in and identity
// derivation share one prompt. prf_out never reaches this function.
//
// POST { action: 'register/options', display_name }
// POST { action: 'register/verify', challenge_id, response: RegistrationResponseJSON }
// POST { action: 'login/options' }
// POST { action: 'login/verify', challenge_id, response: AuthenticationResponseJSON }

import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  isoBase64URL,
  type RegistrationResponseJSON,
  type SupabaseClient,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '../_shared/deps.ts';
import { env, optionalEnv } from '../_shared/env.ts';
import { handler, HttpError, json, readJson } from '../_shared/http.ts';
import { sha256Hex } from '../_shared/meta.ts';
import { adminClient, anonClient } from '../_shared/supabase.ts';

interface Body {
  action?: string;
  display_name?: string;
  challenge_id?: string;
  response?: unknown;
}

const rpID = () => env('WEBAUTHN_RP_ID');
const expectedOrigins = () =>
  env('APP_ORIGIN').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);

Deno.serve(handler(async (req) => {
  const body = await readJson<Body>(req);
  const db = adminClient();

  switch (body.action) {
    case 'register/options':
      return json(req, await registerOptions(db, body));
    case 'register/verify':
      return json(req, await registerVerify(db, body));
    case 'login/options':
      return json(req, await loginOptions(db));
    case 'login/verify':
      return json(req, await loginVerify(db, body));
    default:
      throw new HttpError(400, 'invalid', 'unknown action');
  }
}));

async function prfSalt(): Promise<string> {
  const hex = await sha256Hex('lihim/v1');
  return isoBase64URL.fromBuffer(Uint8Array.from(hex.match(/../g)!, (b) => parseInt(b, 16)));
}

async function registerOptions(db: SupabaseClient, body: Body) {
  const displayName = (body.display_name ?? '').trim();
  if (displayName.length < 1 || displayName.length > 80) throw new HttpError(400, 'invalid', 'display_name');

  const webauthnUserId = crypto.getRandomValues(new Uint8Array(32));
  const options = await generateRegistrationOptions({
    rpName: optionalEnv('WEBAUTHN_RP_NAME', 'Lihim'),
    rpID: rpID(),
    // Shown in the OS passkey picker. Not used for anything server-side.
    userName: displayName,
    userDisplayName: displayName,
    userID: webauthnUserId,
    attestationType: 'none',
    // Discoverable + synced passkeys so a lost phone can sign back in (same prf_out).
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });

  const { data, error } = await db
    .from('webauthn_challenges')
    .insert({
      kind: 'registration',
      challenge: options.challenge,
      webauthn_user_id: isoBase64URL.fromBuffer(webauthnUserId),
      display_name: displayName,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { challenge_id: data.id, options, prf_salt: await prfSalt() };
}

async function takeChallenge(db: SupabaseClient, id: string | undefined, kind: string) {
  if (!id) throw new HttpError(400, 'invalid', 'challenge_id required');
  // Delete-and-return makes each challenge single-use even under concurrent verifies.
  const { data, error } = await db
    .from('webauthn_challenges')
    .delete()
    .eq('id', id)
    .eq('kind', kind)
    .select('challenge, webauthn_user_id, display_name, expires_at')
    .maybeSingle();
  if (error) throw error;
  if (!data || new Date(data.expires_at).getTime() < Date.now()) throw new HttpError(400, 'challenge_expired');
  return data;
}

async function registerVerify(db: SupabaseClient, body: Body) {
  const ch = await takeChallenge(db, body.challenge_id, 'registration');
  const verification = await verifyRegistrationResponse({
    response: body.response as RegistrationResponseJSON,
    expectedChallenge: ch.challenge,
    expectedOrigin: expectedOrigins(),
    expectedRPID: rpID(),
    requireUserVerification: true,
  }).catch((e) => {
    throw new HttpError(400, 'invalid', (e as Error).message);
  });
  if (!verification.verified) throw new HttpError(400, 'invalid', 'registration not verified');
  const info = verification.registrationInfo;

  const email = `${crypto.randomUUID()}@${optionalEnv('PASSKEY_EMAIL_DOMAIN', 'passkey.lihim.invalid')}`;
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: ch.display_name },
    app_metadata: { provider: 'passkey' },
  });
  if (createError || !created.user) throw createError ?? new Error('createUser failed');

  const { error: credError } = await db.from('passkey_credentials').insert({
    user_id: created.user.id,
    credential_id: info.credential.id,
    public_key: isoBase64URL.fromBuffer(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports ?? [],
    webauthn_user_id: ch.webauthn_user_id,
    device_type: info.credentialDeviceType,
    backed_up: info.credentialBackedUp,
  });
  if (credError) {
    await db.auth.admin.deleteUser(created.user.id);
    if (credError.code === '23505') throw new HttpError(409, 'conflict', 'passkey already registered');
    throw credError;
  }

  return { session: await mintSession(db, email), backed_up: info.credentialBackedUp };
}

async function loginOptions(db: SupabaseClient) {
  // Empty allowCredentials = discoverable credential; the OS shows the user's passkeys.
  const options = await generateAuthenticationOptions({ rpID: rpID(), userVerification: 'required' });
  const { data, error } = await db
    .from('webauthn_challenges')
    .insert({ kind: 'authentication', challenge: options.challenge })
    .select('id')
    .single();
  if (error) throw error;
  return { challenge_id: data.id, options, prf_salt: await prfSalt() };
}

async function loginVerify(db: SupabaseClient, body: Body) {
  const ch = await takeChallenge(db, body.challenge_id, 'authentication');
  const response = body.response as AuthenticationResponseJSON;
  if (!response?.id) throw new HttpError(400, 'invalid', 'response.id required');

  const { data: cred, error } = await db
    .from('passkey_credentials')
    .select('id, user_id, credential_id, public_key, counter, transports')
    .eq('credential_id', response.id)
    .maybeSingle();
  if (error) throw error;
  if (!cred) throw new HttpError(401, 'unknown_credential');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: ch.challenge,
    expectedOrigin: expectedOrigins(),
    expectedRPID: rpID(),
    requireUserVerification: true,
    credential: {
      id: cred.credential_id,
      publicKey: isoBase64URL.toBuffer(cred.public_key),
      counter: Number(cred.counter),
      transports: cred.transports,
    },
  }).catch((e) => {
    throw new HttpError(401, 'unauthorized', (e as Error).message);
  });
  if (!verification.verified) throw new HttpError(401, 'unauthorized');

  await db
    .from('passkey_credentials')
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq('id', cred.id);

  const { data: u, error: userError } = await db.auth.admin.getUserById(cred.user_id);
  if (userError || !u.user?.email) throw userError ?? new Error('user has no email');
  return { session: await mintSession(db, u.user.email) };
}

async function mintSession(db: SupabaseClient, email: string) {
  const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !link.properties?.hashed_token) throw error ?? new Error('generateLink failed');
  const { data, error: otpError } = await anonClient().auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (otpError || !data.session) throw otpError ?? new Error('verifyOtp returned no session');
  const s = data.session;
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    user_id: s.user.id,
  };
}

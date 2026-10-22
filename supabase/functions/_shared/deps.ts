// Every third-party import goes through this file so versions are pinned in
// one place (no import map needed for `supabase functions deploy`).

export {
  Account,
  Address,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Keypair,
  nativeToScVal,
  Operation,
  rpc,
  scValToNative,
  SorobanDataBuilder,
  Transaction,
  TransactionBuilder,
  xdr,
} from 'npm:@stellar/stellar-sdk@17.3.0';

export { createClient } from 'npm:@supabase/supabase-js@2.118.0';
export type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.118.0';

export {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from 'npm:@simplewebauthn/server@14.0.3';
export type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from 'npm:@simplewebauthn/server@14.0.3';
export { isoBase64URL } from 'npm:@simplewebauthn/server@14.0.3/helpers';

export { Group as SemaphoreGroup } from 'npm:@semaphore-protocol/group@4.14.5';

// TODO(M0): confirm web-push's node:crypto/node:https usage works on the Supabase
// edge runtime; fall back to jsr:@negrel/webpush if it does not.
export { default as webpush } from 'npm:web-push@3.6.7';

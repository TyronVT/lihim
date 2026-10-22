// Which contract function each admin action maps to, and how to read the
// arguments we need to cross-check against Postgres.
//
// Signatures (contracts/INTERFACE.md §4; the admin sig is always the last arg):
//   semaphore.create_group(admin_key: BytesN<32>, sig: BytesN<64>) -> u64
//   semaphore.add_member(group_id: u64, commitment: U256, sig)
//   semaphore.add_members(group_id: u64, commitments: Vec<U256>, sig)
//   semaphore.update_member(group_id: u64, old: U256, new: U256, siblings: Vec<U256>, sig)
//   semaphore.remove_member(group_id: u64, old: U256, siblings: Vec<U256>, sig)
//   polls.create_poll(group_id: u64, kind: PollKind, closes_at: u64, meta_hash: BytesN<32>, sig) -> u64
//
// The signature binds (contract, fn_tag, on-chain group id, nonce, args); the
// contract checks it, so a forged or stale request fails simulation. The id in
// the create_group digest is the predicted `semaphore.next_group_id()` (D1).
//
// update_member / remove_member need the member's commitment, which only the
// member knows (D5). The MVP app never sends them; they stay accepted here for
// the later member-leaves / re-key flow.

import { Address, Transaction, TransactionBuilder, xdr } from './deps.ts';
import { HttpError } from './http.ts';
import type { StellarConfig } from './stellar.ts';

export const ADMIN_ACTIONS = [
  'create_group',
  'add_member',
  'add_members',
  'update_member',
  'remove_member',
  'create_poll',
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/** Argument count per function (sig included). */
export const ARG_COUNT: Record<AdminAction, number> = {
  create_group: 2,
  add_member: 3,
  add_members: 3,
  update_member: 5,
  remove_member: 4,
  create_poll: 5,
};

/** Which admin nonce the call consumes. Calls on the same counter must not overlap (INTERFACE.md §5.2). */
export function nonceCounter(action: AdminAction): 'semaphore' | 'polls' | null {
  if (action === 'create_group') return null; // always nonce 0 at a fresh id
  return action === 'create_poll' ? 'polls' : 'semaphore';
}

export function isAdminAction(x: unknown): x is AdminAction {
  return typeof x === 'string' && (ADMIN_ACTIONS as readonly string[]).includes(x);
}

export function targetContract(cfg: StellarConfig, action: AdminAction): string {
  return action === 'create_poll' ? cfg.pollsContractId : cfg.semaphoreContractId;
}

export interface Invocation {
  contractId: string;
  fn: string;
  args: xdr.ScVal[];
  /** Present when the browser sent a full signed envelope (fee-bump path). */
  inner?: Transaction;
}

/** Payload mode: args_xdr is a base64 ScVal::Vec holding the full argument list. */
export function invocationFromArgs(cfg: StellarConfig, action: AdminAction, argsXdr: string): Invocation {
  let v: xdr.ScVal;
  try {
    v = xdr.ScVal.fromXdr(argsXdr, 'base64');
  } catch {
    throw new HttpError(400, 'invalid', 'args_xdr is not a ScVal');
  }
  if (v.type !== 'scvVec') throw new HttpError(400, 'invalid', 'args_xdr must be a Vec');
  const args = v.vec ?? [];
  checkShape(action, args);
  return { contractId: targetContract(cfg, action), fn: action, args };
}

/** Right number of arguments, and a 64-byte signature last. */
function checkShape(action: AdminAction, args: xdr.ScVal[]): void {
  if (args.length !== ARG_COUNT[action]) {
    throw new HttpError(400, 'invalid', `${action} takes ${ARG_COUNT[action]} arguments, got ${args.length}`);
  }
  argBytesHex(args, args.length - 1, 64, 'sig');
}

/**
 * Envelope mode: a transaction built and signed in the browser (e.g. if admin
 * auth moves to a passkey smart account). We only fee-bump it, so it must be
 * exactly one invokeContract of the expected function on the expected contract.
 */
export function invocationFromEnvelope(cfg: StellarConfig, action: AdminAction, txXdr: string): Invocation {
  let tx: Transaction;
  try {
    const parsed = TransactionBuilder.fromXDR(txXdr, cfg.networkPassphrase);
    if (!(parsed instanceof Transaction)) throw new Error('fee-bump envelopes are not accepted');
    tx = parsed;
  } catch (e) {
    throw new HttpError(400, 'invalid', `tx_xdr: ${(e as Error).message}`);
  }
  if (tx.operations.length !== 1) throw new HttpError(400, 'invalid', 'expected exactly one operation');
  const op = tx.operations[0];
  if (op.type !== 'invokeHostFunction') throw new HttpError(400, 'invalid', 'expected invokeHostFunction');
  const fn = op.func;
  if (fn.type !== 'hostFunctionTypeInvokeContract') throw new HttpError(400, 'invalid', 'expected a contract call');
  const call = fn.invokeContract;
  const contractId = Address.fromScAddress(call.contractAddress).toString();
  const fnName = call.functionName.toString();
  if (contractId !== targetContract(cfg, action) || fnName !== action) {
    throw new HttpError(400, 'invalid', 'transaction does not match the requested action');
  }
  checkShape(action, call.args);
  return { contractId, fn: fnName, args: call.args, inner: tx };
}

export function argU64(args: xdr.ScVal[], i: number, label: string): bigint {
  const a = args[i];
  if (!a || a.type !== 'scvU64') throw new HttpError(400, 'invalid', `${label} must be u64`);
  return a.u64;
}

export function argBytesHex(args: xdr.ScVal[], i: number, len: number, label: string): string {
  const a = args[i];
  if (!a || a.type !== 'scvBytes' || a.bytes.value.length !== len) {
    throw new HttpError(400, 'invalid', `${label} must be ${len} bytes`);
  }
  return Array.from(a.bytes.value, (b) => b.toString(16).padStart(2, '0')).join('');
}

export type PollKindArg = { kind: 'single'; n: number } | { kind: 'rating' } | { kind: 'yesno' };

/**
 * `PollKind` as encoded on the wire: Vec[Symbol("Single"), U32(n)],
 * Vec[Symbol("Rating")] or Vec[Symbol("YesNo")] (INTERFACE.md §2).
 */
export function argPollKind(args: xdr.ScVal[], i: number): PollKindArg {
  const a = args[i];
  const items = a && a.type === 'scvVec' ? a.vec ?? [] : null;
  const tag = items?.[0]?.type === 'scvSymbol' ? items[0].sym.toString() : null;
  if (tag === 'Single' && items!.length === 2 && items![1].type === 'scvU32') {
    return { kind: 'single', n: items![1].u32 };
  }
  if (tag === 'Rating' && items!.length === 1) return { kind: 'rating' };
  if (tag === 'YesNo' && items!.length === 1) return { kind: 'yesno' };
  throw new HttpError(400, 'invalid', 'kind must be a PollKind (Single(u32) | Rating | YesNo)');
}

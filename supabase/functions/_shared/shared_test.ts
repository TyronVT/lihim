// cd supabase/functions && deno test --no-lock --allow-env _shared/shared_test.ts
// Exercises the pure helpers against the real stellar-sdk XDR types and the
// known-answer vectors in contracts/test-vectors (INTERFACE.md §3, §9).

import assert from 'node:assert/strict';
import scvalVectors from '../../../contracts/test-vectors/scval.json' with { type: 'json' };
import { Address, Contract, nativeToScVal, type rpc, xdr } from './deps.ts';
import { argBytesHex, argPollKind, argU64, invocationFromArgs } from './admin_actions.ts';
import { classifyFailure, failureReason } from './contract_errors.ts';
import { decodeLihimEvent } from './events.ts';
import { canonicalPollMeta, pollMetaHash } from './meta.ts';
import type { StellarConfig } from './stellar.ts';
import {
  leafKey,
  nullifierKey,
  pollKeys,
  pollsNonceKey,
  rootKey,
  semaphoreGroupKeys,
  verifierKeys,
} from './storage_keys.ts';

// The same fixed contracts the vectors use: semaphore CAAQC…C526, polls CABAE…FNSZ, verifier CAAAA…FCT4.
const SEM = Address.contract(new Uint8Array(32).fill(1)).toString();
const POLLS = Address.contract(new Uint8Array(32).fill(2)).toString();
const VERIFIER = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4';
const OTHER = Address.contract(new Uint8Array(32).fill(3)).toString();
const contracts = { semaphore: SEM, polls: POLLS };

const u256 = (v: bigint) => nativeToScVal(v, { type: 'u256' });
const u32 = (v: number) => nativeToScVal(v, { type: 'u32' });
const u64 = (v: bigint) => xdr.ScVal.scvU64(v);
const vec = (...items: xdr.ScVal[]) => xdr.ScVal.scvVec(items);
const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const bytes = (n: number, fill: number) => xdr.ScVal.scvBytes(new Uint8Array(n).fill(fill));
const hex = (v: { toXdr(f: 'base64'): string }) =>
  Array.from(atob(v.toXdr('base64')), (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');

function event(contract: string, name: string, id: bigint, value: xdr.ScVal): rpc.Api.EventResponse {
  return {
    id: '0000000528280977408-0000000002',
    type: 'contract',
    ledger: 123,
    ledgerClosedAt: '2026-10-22T00:00:00Z',
    transactionIndex: 1,
    operationIndex: 0,
    txHash: 'ab'.repeat(32),
    // EventResponse.contractId is a Contract; the decoder only calls .contractId().
    contractId: { contractId: () => contract } as never,
    topic: [xdr.ScVal.scvSymbol(name), u64(id)],
    value,
  };
}

function decodeOk(ev: rpc.Api.EventResponse) {
  const d = decodeLihimEvent(ev, contracts);
  assert.ok(d && !('error' in d), `expected a decoded event, got ${JSON.stringify(d)}`);
  return d;
}

Deno.test('decodes members_added tuple into decimal strings', () => {
  const d = decodeOk(event(SEM, 'members_added', 7n, vec(u32(3), vec(u256(11n), u256(2n ** 250n)), u256(99n))));
  assert.equal(d.type, 'members_added');
  assert.equal(d.topic_id, '7');
  assert.equal(d.event_index, 2);
  assert.deepEqual(d.payload, { start_index: 3, commitments: ['11', (2n ** 250n).toString()], root: '99' });
});

Deno.test('decodes voted, poll_created (bytes as hex) and unit poll_closed', () => {
  assert.deepEqual(decodeOk(event(POLLS, 'voted', 5n, vec(u256(42n), u32(1)))).payload, { nullifier: '42', choice: 1 });

  const created = decodeOk(
    event(
      POLLS,
      'poll_created',
      5n,
      vec(u64(1n), u32(0), u32(3), u256(77n), u32(9), u64(1_800_000_000n), xdr.ScVal.scvBytes(new Uint8Array(32).fill(0xcd))),
    ),
  );
  assert.deepEqual(created.payload, {
    group_id: '1',
    kind_tag: 0,
    n_options: 3,
    frozen_root: '77',
    frozen_size: 9,
    closes_at: '1800000000',
    meta_hash: 'cd'.repeat(32),
  });

  assert.deepEqual(decodeOk(event(POLLS, 'poll_closed', 5n, xdr.ScVal.scvVoid())).payload, {});
});

Deno.test('accepts #[contractevent] map payloads', () => {
  const map = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('choice'), val: u32(0) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('nullifier'), val: u256(8n) }),
  ]);
  assert.deepEqual(decodeOk(event(POLLS, 'voted', 1n, map)).payload, { nullifier: '8', choice: 0 });
});

Deno.test('ignores foreign contracts and events from the wrong contract; flags bad shapes', () => {
  assert.equal(decodeLihimEvent(event(OTHER, 'voted', 1n, xdr.ScVal.scvVoid()), contracts), null);
  // A "voted" event from the Semaphore contract is not a vote.
  assert.equal(decodeLihimEvent(event(SEM, 'voted', 1n, xdr.ScVal.scvVoid()), contracts), null);
  const bad = decodeLihimEvent(event(POLLS, 'voted', 1n, vec(u256(1n))), contracts);
  assert.ok(bad && 'error' in bad);
});

Deno.test('proof_validated: caller comes first, and only the polls namespace is kept', () => {
  const data = (caller: string) =>
    vec(new Address(caller).toScVal(), u256(1001n), u256(77n), u256(1n), u256(42n));
  assert.deepEqual(decodeOk(event(SEM, 'proof_validated', 1n, data(POLLS))).payload, {
    caller: POLLS,
    root: '1001',
    nullifier: '77',
    message: '1',
    scope: '42',
  });
  // A proof replayed straight into the semaphore spends it in the replayer's namespace (D3): not ours.
  assert.equal(decodeLihimEvent(event(SEM, 'proof_validated', 1n, data(OTHER)), contracts), null);
  // The pre-D3 four-field shape is a decode error, not a silent pass.
  const old = decodeLihimEvent(event(SEM, 'proof_validated', 1n, vec(u256(1001n), u256(77n), u256(1n), u256(42n))), contracts);
  assert.ok(old && 'error' in old);
});

Deno.test('meta hash input matches the canonical strings used in seed.sql', async () => {
  assert.equal(
    canonicalPollMeta('single', 'Which date works for the org outing?', ['Sat, Nov 8', 'Sun, Nov 9', 'Sat, Nov 15']),
    '{"v":1,"kind":"single","title":"Which date works for the org outing?","options":["Sat, Nov 8","Sun, Nov 9","Sat, Nov 15"]}',
  );
  assert.equal(
    canonicalPollMeta('rating', "Rate the treasurer's Q3 report", null),
    `{"v":1,"kind":"rating","title":"Rate the treasurer's Q3 report","options":[]}`,
  );
  assert.match(await pollMetaHash('yesno', 'Approve?', ['Yes', 'No']), /^[0-9a-f]{64}$/);
});

Deno.test('admin args round-trip through base64 ScVal::Vec', () => {
  const cfg = { semaphoreContractId: SEM, pollsContractId: POLLS } as StellarConfig;
  const args = vec(u64(12n), vec(sym('Single'), u32(3)), u64(1_800_000_000n), bytes(32, 0xee), bytes(64, 0));
  const inv = invocationFromArgs(cfg, 'create_poll', args.toXdr('base64'));
  assert.equal(inv.contractId, POLLS);
  assert.equal(inv.fn, 'create_poll');
  assert.equal(argU64(inv.args, 0, 'group_id'), 12n);
  assert.deepEqual(argPollKind(inv.args, 1), { kind: 'single', n: 3 });
  assert.equal(argU64(inv.args, 2, 'closes_at'), 1_800_000_000n);
  assert.equal(argBytesHex(inv.args, 3, 32, 'meta_hash'), 'ee'.repeat(32));
  assert.throws(() => argBytesHex(inv.args, 4, 32, 'sig'));

  const add = vec(u64(12n), u256(42n), bytes(64, 1));
  assert.equal(invocationFromArgs(cfg, 'add_member', add.toXdr('base64')).contractId, SEM);
  // Wrong argument count, or a sig that is not 64 bytes.
  assert.throws(() => invocationFromArgs(cfg, 'add_member', args.toXdr('base64')), /takes 3 arguments/);
  assert.throws(() => invocationFromArgs(cfg, 'add_member', vec(u64(12n), u256(42n), bytes(32, 1)).toXdr('base64')), /sig/);
  const group = vec(bytes(32, 0xab), bytes(64, 2));
  assert.equal(argBytesHex(invocationFromArgs(cfg, 'create_group', group.toXdr('base64')).args, 0, 32, 'admin_key'), 'ab'.repeat(32));
});

Deno.test('PollKind decodes from the contract vectors and rejects anything else', () => {
  const values = Object.fromEntries(scvalVectors.values.map((v) => [v.name, v.scval_xdr_hex]));
  const fromHex = (h: string) => xdr.ScVal.fromXdr(btoa(String.fromCharCode(...h.match(/../g)!.map((b) => parseInt(b, 16)))), 'base64');
  assert.deepEqual(argPollKind([fromHex(values.poll_kind_single_3)], 0), { kind: 'single', n: 3 });
  assert.deepEqual(argPollKind([fromHex(values.poll_kind_rating)], 0), { kind: 'rating' });
  assert.deepEqual(argPollKind([fromHex(values.poll_kind_yesno)], 0), { kind: 'yesno' });
  assert.throws(() => argPollKind([vec(sym('Single'))], 0));
  assert.throws(() => argPollKind([vec(sym('Rating'), u32(5))], 0));
  assert.throws(() => argPollKind([u32(0)], 0));
});

Deno.test('ledger keys match contracts/test-vectors/scval.json byte for byte', () => {
  const [group, tree, rootTtl, nonce] = semaphoreGroupKeys(SEM, 1n);
  const [poll, tally, voters] = pollKeys(POLLS, 42n);
  const ours: Record<string, xdr.LedgerKey> = {
    'semaphore Group(1)': group,
    'semaphore Tree(1)': tree,
    'semaphore RootTtl(1)': rootTtl,
    'semaphore Nonce(1)': nonce,
    'semaphore Leaf(1, 42)': leafKey(SEM, 1n, 42n),
    'semaphore Root(1, 1001)': rootKey(SEM, 1n, 1001n),
    'semaphore Nullifier(polls, 1, 77)': nullifierKey(SEM, POLLS, 1n, 77n),
    'polls Poll(42)': poll,
    'polls Tally(42)': tally,
    'polls Voters(42)': voters,
    'polls Nonce(1)': pollsNonceKey(POLLS, 1n),
    'verifier Vk(4)': verifierKeys(VERIFIER)[3],
    'semaphore instance': new Contract(SEM).getFootprint(),
  };
  const contractOf: Record<string, string> = { semaphore: SEM, polls: POLLS, verifier: VERIFIER };
  for (const v of scvalVectors.ledger_keys) {
    assert.equal(contractOf[v.name.split(' ')[0]], v.contract, `${v.name}: contract id`);
    assert.ok(ours[v.name], `no builder for vector ${v.name}`);
    assert.equal(hex(ours[v.name]), v.ledger_key_xdr_hex, v.name);
  }
  assert.equal(Object.keys(ours).length, scvalVectors.ledger_keys.length);
  assert.equal(verifierKeys(VERIFIER).length, 32);
});

Deno.test('contract errors are classified from simulation messages', () => {
  const sim = (m: string) => classifyFailure(new Error(`HostError: ${m}\nEvent log (newest first): ...`));
  assert.deepEqual(sim('Error(Contract, #208)'), { kind: 'contract', code: 208, name: 'AlreadyVoted' });
  assert.deepEqual(sim('Error(Contract, #113)'), { kind: 'contract', code: 113, name: 'NullifierUsed' });
  assert.equal(failureReason(sim('Error(Contract, #201)')), 'TooFewMembers (#201)');
  assert.deepEqual(sim('Error(Crypto, InvalidInput)'), { kind: 'signature' });
  assert.deepEqual(sim('Error(Auth, InvalidAction)'), { kind: 'auth' });
  assert.deepEqual(sim('Error(Storage, MissingValue)'), { kind: 'host', detail: 'Storage:MissingValue' });
  assert.deepEqual(classifyFailure(new Error('fetch failed')), { kind: 'unknown' });
});

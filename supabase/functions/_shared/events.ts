// Decoding of LihimSemaphore / LihimPolls contract events into the JSON shape
// stored in chain_events.payload (contracts/INTERFACE.md §7):
//   topics = [Symbol(name), U64(id)], data = Vec of the fields below in this
//   order (declaration order, not sorted); poll_closed has Void data.
// U256/u64 become decimal strings, u32 stays a number, BytesN becomes lowercase
// hex, Address becomes its strkey. A map payload (field name -> value) is
// accepted too.

import { type rpc, scValToNative, type xdr } from './deps.ts';

export const SEMAPHORE_EVENTS = {
  group_created: ['admin'],
  member_added: ['index', 'commitment', 'root'],
  members_added: ['start_index', 'commitments', 'root'],
  member_updated: ['index', 'old', 'new', 'root'],
  member_removed: ['index', 'old', 'root'],
  // caller = the app whose nullifier namespace was spent (D3). Only caller ==
  // LihimPolls is a vote; anyone can emit others by calling validate_proof
  // with an address they control.
  proof_validated: ['caller', 'root', 'nullifier', 'message', 'scope'],
} as const;

export const POLLS_EVENTS = {
  poll_created: ['group_id', 'kind_tag', 'n_options', 'frozen_root', 'frozen_size', 'closes_at', 'meta_hash'],
  // choice is the raw message: option index, 0 Yes / 1 No, or rating 1..=5.
  voted: ['nullifier', 'choice'],
  poll_closed: [],
} as const;

export type SemaphoreEventType = keyof typeof SEMAPHORE_EVENTS;
export type PollsEventType = keyof typeof POLLS_EVENTS;
export type LihimEventType = SemaphoreEventType | PollsEventType;

export const GROUP_MEMBER_EVENTS: readonly LihimEventType[] = [
  'member_added',
  'members_added',
  'member_updated',
  'member_removed',
];

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export interface DecodedEvent {
  event_id: string;
  ledger: number;
  ledger_closed_at: string;
  tx_hash: string;
  event_index: number;
  contract: string;
  type: LihimEventType;
  topic_id: string; // u64 as decimal string
  payload: Record<string, JsonValue>;
}

function toJson(v: unknown): JsonValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (v instanceof Uint8Array) return Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('');
  if (Array.isArray(v)) return v.map(toJson);
  if (typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, toJson(x)]));
  }
  return String(v);
}

function topicSymbol(t: xdr.ScVal | undefined): string | null {
  if (!t) return null;
  const native = scValToNative(t);
  return typeof native === 'string' ? native : null;
}

function payloadFor(fields: readonly string[], value: xdr.ScVal): Record<string, JsonValue> | null {
  const native = scValToNative(value);
  if (fields.length === 0) return {};
  if (Array.isArray(native)) {
    if (native.length !== fields.length) return null;
    return Object.fromEntries(fields.map((f, i) => [f, toJson(native[i])]));
  }
  if (native && typeof native === 'object' && !(native instanceof Uint8Array)) {
    const obj = native as Record<string, unknown>;
    if (!fields.every((f) => f in obj)) return null;
    return Object.fromEntries(fields.map((f) => [f, toJson(obj[f])]));
  }
  // A single-field event may publish the bare value instead of a 1-tuple.
  if (fields.length === 1) return { [fields[0]]: toJson(native) };
  return null;
}

/**
 * Returns null for events that are not ours or do not match the expected shape
 * (logged by the caller as an integrity alert, never silently trusted).
 */
export function decodeLihimEvent(
  ev: rpc.Api.EventResponse,
  contracts: { semaphore: string; polls: string },
): DecodedEvent | { error: string; event_id: string } | null {
  const contract = ev.contractId?.contractId();
  if (!contract) return null;
  const table: Record<string, readonly string[]> | null = contract === contracts.semaphore
    ? SEMAPHORE_EVENTS
    : contract === contracts.polls
    ? POLLS_EVENTS
    : null;
  if (!table) return null;

  const name = topicSymbol(ev.topic[0]);
  if (!name || !(name in table)) return null; // e.g. SDK-internal or future events
  const fields = table[name];

  let topicId: string;
  try {
    const id = ev.topic[1] ? scValToNative(ev.topic[1]) : undefined;
    if (typeof id !== 'bigint' && typeof id !== 'number') throw new Error('topic id is not an integer');
    topicId = BigInt(id).toString();
  } catch (e) {
    return { error: `${name}: ${(e as Error).message}`, event_id: ev.id };
  }

  const payload = payloadFor(fields, ev.value);
  if (!payload) return { error: `${name}: unexpected data shape`, event_id: ev.id };

  // RPC event ids are "<toid>-<index within the operation>"; Soroban txs have one op.
  const eventIndex = Number.parseInt(ev.id.split('-')[1] ?? '0', 10);

  // A proof spent in someone else's namespace is not ours: dropping it keeps
  // a replayed or junk validate_proof from filling chain_events.
  if (name === 'proof_validated' && payload.caller !== contracts.polls) return null;

  return {
    event_id: ev.id,
    ledger: ev.ledger,
    ledger_closed_at: ev.ledgerClosedAt,
    tx_hash: ev.txHash,
    event_index: eventIndex,
    contract,
    type: name as LihimEventType,
    topic_id: topicId,
    payload,
  };
}

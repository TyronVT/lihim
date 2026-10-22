import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import type { LihimProof } from "./wire.ts";

// Hand-built ScVals for LihimPolls.vote(poll_id: u64, proof: Proof).
// Built here rather than via generated bindings so the exact bytes the relay
// sends are reviewable in one place. Recipes and known-answer vectors:
// contracts/INTERFACE.md §3 and contracts/test-vectors/scval.json.

const u256 = (n: bigint): xdr.ScVal => nativeToScVal(n, { type: "u256" });

/**
 * `lihim_common::Proof`. A Soroban `#[contracttype] struct` is encoded as an
 * ScMap keyed by field-name symbols, and the host requires the keys in sorted
 * order: depth, message, nullifier, points, root, scope. `points` is a
 * `Vec<U256>` of exactly 8 (packGroth16Proof order); `message` and `scope` are
 * raw, the contract hashes them itself.
 */
export function proofToScVal(proof: LihimProof): xdr.ScVal {
  const fields: [string, xdr.ScVal][] = [
    ["depth", xdr.ScVal.scvU32(proof.depth)],
    ["message", u256(proof.message)],
    ["nullifier", u256(proof.nullifier)],
    ["points", xdr.ScVal.scvVec(proof.points.map(u256))],
    ["root", u256(proof.root)],
    ["scope", u256(proof.scope)],
  ];
  fields.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return xdr.ScVal.scvMap(
    fields.map(([key, val]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val })),
  );
}

/**
 * Args for `vote(poll_id: u64, proof: Proof)`. `vote` has no require_auth and
 * polls authorizes itself to the semaphore as direct invoker (nullifiers are
 * spent in the polls namespace), so the transaction needs no auth entries.
 */
export function voteArgs(pollId: bigint, proof: LihimProof): xdr.ScVal[] {
  return [nativeToScVal(pollId, { type: "u64" }), proofToScVal(proof)];
}

export type ContractRejection = { kind: "already_answered" } | { kind: "invalid"; reason: string };

const invalid = (reason: string): ContractRejection => ({ kind: "invalid", reason });
const ALREADY_ANSWERED: ContractRejection = { kind: "already_answered" };

/**
 * Contract error codes (contracts/INTERFACE.md §8). Codes are unique across
 * the three contracts, and an error raised inside LihimSemaphore or
 * LihimVerifier surfaces unchanged through `polls.vote`, so one flat table
 * covers everything a vote simulation can return.
 *
 * Every code is listed, including ones `vote` cannot raise (admin and
 * create_poll errors), so a contract change that starts surfacing one still
 * gets a specific reason instead of "rejected".
 */
export const CONTRACT_ERRORS: Readonly<Record<number, ContractRejection>> = {
  // LihimSemaphore
  100: invalid("unknown_group"), // GroupNotFound
  101: invalid("leaf_out_of_field"), // LeafOutOfField
  102: invalid("leaf_is_zero"), // LeafIsZero
  103: invalid("leaf_exists"), // LeafExists
  104: invalid("leaf_not_found"), // LeafNotFound
  105: invalid("wrong_sibling_nodes"), // WrongSiblingNodes
  106: invalid("empty_batch"), // EmptyBatch
  107: invalid("batch_too_large"), // BatchTooLarge
  108: invalid("bad_depth"), // DepthNotSupported
  109: invalid("depth_too_small"), // DepthTooSmall
  110: invalid("empty_group"), // GroupHasNoMembers
  111: invalid("unknown_root"), // RootNotInGroup
  112: invalid("root_expired"), // RootExpired (not raised on the frozen path polls uses)
  // NullifierUsed. Polls checks its own 208 first, so from `vote` this is only
  // a same-ledger race with an identical vote.
  113: ALREADY_ANSWERED,
  114: invalid("bad_proof"), // InvalidProof (Groth16 failed)
  115: invalid("malformed_proof"), // MalformedProof (points.len() != 8)
  116: invalid("field_out_of_range"), // FieldOutOfRange
  // LihimPolls
  200: invalid("unknown_poll"), // PollNotFound
  201: invalid("too_few_members"), // TooFewMembers
  202: invalid("invalid_kind"), // InvalidKind
  203: invalid("invalid_close_time"), // InvalidCloseTime
  204: invalid("poll_closed"), // PollClosed (closed, or now >= closes_at)
  205: invalid("root_mismatch"), // WrongRoot (proof.root != frozen_root)
  206: invalid("scope_mismatch"), // WrongScope (scope != poll_id)
  207: invalid("choice_out_of_range"), // ChoiceOutOfRange
  208: ALREADY_ANSWERED, // AlreadyVoted
  209: invalid("not_yet_closable"), // NotYetClosable
  210: invalid("poll_closed"), // AlreadyClosed
  // LihimVerifier. 300/302/303/304 are deployment problems, not the voter's,
  // but INTERFACE §8 maps every contract error on /vote to 400.
  300: invalid("verifier_finalized"), // Finalized
  301: invalid("bad_depth"), // DepthNotSupported
  302: invalid("verifier_not_ready"), // VkNotSet
  303: invalid("verifier_not_ready"), // MalformedVk
  304: invalid("verifier_not_ready"), // MissingVks
  305: invalid("malformed_proof"), // MalformedInput
};

export function classifyContractError(code: number): ContractRejection {
  return CONTRACT_ERRORS[code] ?? invalid("rejected");
}

/**
 * Pull the contract error code out of an RPC simulation error string, e.g.
 * "HostError: Error(Contract, #208)". The top-level error comes first; nested
 * frames in the event log after it are ignored. Returns null for non-contract
 * errors (host traps such as Error(Crypto, …) or Error(Auth, …)).
 */
export function contractErrorCode(simError: string): number | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(simError);
  return m ? Number(m[1]) : null;
}

/** Budget exhaustion is the relay's resource problem, not the voter's fault. */
export function isBudgetError(simError: string): boolean {
  return /Error\(Budget,/.test(simError);
}

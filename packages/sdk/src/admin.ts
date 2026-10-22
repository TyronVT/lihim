import { sha256 } from "@noble/hashes/sha2.js";
import { be64 } from "./encoding.js";

export type AdminFnTag =
  | "create_group"
  | "add_member"
  | "add_members"
  | "update_member"
  | "remove_member"
  | "create_poll";

export type AdminMessageInput = {
  /** Contract address as a `C...` strkey; its ASCII bytes are hashed. */
  contractId: string;
  fnTag: AdminFnTag;
  /**
   * ON-CHAIN u64 group id (for `create_group`: `semaphore.next_group_id()`),
   * not the Supabase `groups.id` uuid the key is derived from.
   */
  groupId: bigint;
  /**
   * Admin nonce: `semaphore.nonce(group_id)` for group calls, always 0 for
   * `create_group`, `polls.nonce(group_id)` for `create_poll`.
   */
  nonce: bigint;
  /** XDR of an ScVal::Vec of the call's args; see `adminArgs` / `encodeAdminArgs` in ./contracts. */
  argsXdr: Uint8Array;
};

const ascii = (s: string) => new TextEncoder().encode(s);

/**
 * Digest the group admin signs with Ed25519 (the 32 bytes themselves, no
 * prehash), contracts/INTERFACE.md §5.1:
 * sha256(contract_strkey || fn_tag || group_id_be64 || nonce_be64 || args_xdr).
 *
 * Binding the contract address and fn tag stops a signature for one call
 * being replayed against another call or another deployment.
 */
export function adminMessage({ contractId, fnTag, groupId, nonce, argsXdr }: AdminMessageInput): Uint8Array {
  if (!/^C[A-Z2-7]{55}$/.test(contractId)) throw new TypeError("contractId must be a C... strkey");
  const parts = [ascii(contractId), ascii(fnTag), be64(groupId), be64(nonce), argsXdr];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return sha256(buf);
}

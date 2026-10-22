// Persistent ledger keys the keeper keeps alive (contracts/INTERFACE.md §9).
//
// Every DataKey is a #[contracttype] enum, so a key is Vec[Symbol(variant), ...fields].
// Byte-for-byte checked against contracts/test-vectors/scval.json in shared_test.ts.
//
// LihimSemaphore: Group(gid), Tree(gid), RootTtl(gid), Nonce(gid),
//                 Leaf(gid, commitment), Root(gid, root) (replaced roots only),
//                 Nullifier(caller, gid, nullifier)  -- caller = LihimPolls for votes (D3)
// LihimPolls:     Poll(pid), Tally(pid), Voters(pid), Nonce(gid) (create_poll nonce)
// LihimVerifier:  Vk(depth) for depth 1..=32
// Instance entries (NextGroupId, Semaphore, MinMembers, ...) live inside the
// contract-instance entry: use `new Contract(id).getFootprint()` for those.

import { Address, nativeToScVal, xdr } from './deps.ts';

export const MIN_DEPTH = 1;
export const MAX_DEPTH = 32;

export function persistentKey(contractId: string, key: xdr.ScVal): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}

const u32 = (n: number) => xdr.ScVal.scvU32(n);
const u64 = (n: bigint) => nativeToScVal(n, { type: 'u64' });
const u256 = (n: bigint) => nativeToScVal(n, { type: 'u256' });
const addr = (strkey: string) => new Address(strkey).toScVal();

/** `DataKey::Variant(fields...)` → Vec[Symbol("Variant"), ...fields]. */
function variant(name: string, ...fields: xdr.ScVal[]): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name), ...fields]);
}

/** Group, Tree, RootTtl, Nonce of one group (what `bump_group` extends). */
export function semaphoreGroupKeys(semaphoreId: string, chainGroupId: bigint): xdr.LedgerKey[] {
  return ['Group', 'Tree', 'RootTtl', 'Nonce'].map((v) => persistentKey(semaphoreId, variant(v, u64(chainGroupId))));
}

/** `Leaf(gid, commitment)`: index + 1 of a current member. */
export function leafKey(semaphoreId: string, chainGroupId: bigint, commitment: bigint): xdr.LedgerKey {
  return persistentKey(semaphoreId, variant('Leaf', u64(chainGroupId), u256(commitment)));
}

/** `Root(gid, root)`: exists only once the root has been replaced. */
export function rootKey(semaphoreId: string, chainGroupId: bigint, root: bigint): xdr.LedgerKey {
  return persistentKey(semaphoreId, variant('Root', u64(chainGroupId), u256(root)));
}

/** `Nullifier(caller, gid, nullifier)`. For votes, caller is the LihimPolls contract (D3). */
export function nullifierKey(
  semaphoreId: string,
  caller: string,
  chainGroupId: bigint,
  nullifier: bigint,
): xdr.LedgerKey {
  return persistentKey(semaphoreId, variant('Nullifier', addr(caller), u64(chainGroupId), u256(nullifier)));
}

/** Poll, Tally, Voters of one poll (what `bump_poll` extends). */
export function pollKeys(pollsId: string, chainPollId: bigint): xdr.LedgerKey[] {
  return ['Poll', 'Tally', 'Voters'].map((v) => persistentKey(pollsId, variant(v, u64(chainPollId))));
}

/** LihimPolls `Nonce(gid)`: exists once the group has had a create_poll. */
export function pollsNonceKey(pollsId: string, chainGroupId: bigint): xdr.LedgerKey {
  return persistentKey(pollsId, variant('Nonce', u64(chainGroupId)));
}

/** LihimVerifier `Vk(depth)` for every supported depth. */
export function verifierKeys(verifierId: string): xdr.LedgerKey[] {
  const keys: xdr.LedgerKey[] = [];
  for (let d = MIN_DEPTH; d <= MAX_DEPTH; d++) keys.push(persistentKey(verifierId, variant('Vk', u32(d))));
  return keys;
}

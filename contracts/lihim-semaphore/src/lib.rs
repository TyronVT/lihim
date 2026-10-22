//! LihimSemaphore: Semaphore V4 groups on Soroban.
//!
//! Mirrors `Semaphore.sol` / `SemaphoreGroups.sol` (semaphore-protocol V4)
//! where Soroban allows, with two deliberate differences:
//!
//! - Group admins are Ed25519 keys derived per group on the user's device,
//!   not accounts. Every admin call carries a signature over
//!   `lihim_common::admin_digest`, with a per-group nonce for replay
//!   protection. Whoever submits the transaction has no role.
//! - `validate_frozen_proof` lets an app that pins a root itself (LihimPolls
//!   freezes the root at poll open) use a root older than `root_ttl`.
//! - Nullifiers are namespaced by the calling app. `validate_proof` and
//!   `validate_frozen_proof` take `caller: Address` and require its auth,
//!   and the nullifier is stored under `(caller, group_id, nullifier)`.
//!   Upstream Semaphore V4 keeps one nullifier set per group, so anyone who
//!   sees a proof in flight can submit it to `validateProof` first and burn
//!   it. Here that only burns it in the front-runner's own namespace.
//!
//! Storage is one persistent entry per logical map key (per leaf, per
//! historical root, per nullifier) rather than one big `Map` per group, so
//! entries stay small, writes stay cheap, and no entry can hit the size
//! limit as a group grows.

#![no_std]

mod imt;

use imt::{Hasher, ImtError, Tree};
use lihim_common::{
    hash_to_field, is_fr, require_admin_sig, Group, Proof, VerifierClient, BUMP_AMOUNT,
    BUMP_THRESHOLD, MAX_DEPTH, MIN_DEPTH, PROOF_POINTS,
};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, vec, Address, BytesN, Env,
    IntoVal, Val, Vec, U256,
};

/// How long a replaced root stays valid for `validate_proof` (Semaphore's
/// `merkleTreeDuration` default).
pub const DEFAULT_ROOT_TTL: u64 = 3_600;

/// Upper bound on one `add_members` batch. The wasm test-env estimate for 32
/// leaves into a ~1000-leaf tree is ~76M CPU (`measure_costs_wasm`), under a
/// 100M per-tx instruction limit. Clients chunk larger imports.
// TODO(M0): measure on testnet against the live `stellar network settings`
// limits and tune.
pub const MAX_BATCH: u32 = 32;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    GroupNotFound = 100,
    LeafOutOfField = 101,
    LeafIsZero = 102,
    LeafExists = 103,
    LeafNotFound = 104,
    WrongSiblingNodes = 105,
    EmptyBatch = 106,
    BatchTooLarge = 107,
    DepthNotSupported = 108,
    DepthTooSmall = 109,
    GroupHasNoMembers = 110,
    RootNotInGroup = 111,
    RootExpired = 112,
    NullifierUsed = 113,
    InvalidProof = 114,
    MalformedProof = 115,
    FieldOutOfRange = 116,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RootRecord {
    /// Ledger timestamp when this root stopped being current.
    pub replaced_at: u64,
    /// Tree depth while this root was current; proofs against it must use
    /// at least this depth.
    pub depth: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    // instance
    Verifier,
    NextGroupId,
    // persistent, per group
    Group(u64),
    Tree(u64),
    RootTtl(u64),
    Nonce(u64),
    // persistent, per group + key
    Leaf(u64, U256),
    Root(u64, U256),
    // persistent, per calling app + group + nullifier
    Nullifier(Address, u64, U256),
}

// --- events (topics = (name, group_id); data = vec of the remaining fields) --

#[contractevent(topics = ["group_created"], data_format = "vec")]
pub struct GroupCreated {
    #[topic]
    pub group_id: u64,
    pub admin: BytesN<32>,
}

#[contractevent(topics = ["member_added"], data_format = "vec")]
pub struct MemberAdded {
    #[topic]
    pub group_id: u64,
    pub index: u32,
    pub commitment: U256,
    pub root: U256,
}

#[contractevent(topics = ["members_added"], data_format = "vec")]
pub struct MembersAdded {
    #[topic]
    pub group_id: u64,
    pub start_index: u32,
    pub commitments: Vec<U256>,
    pub root: U256,
}

#[contractevent(topics = ["member_updated"], data_format = "vec")]
pub struct MemberUpdated {
    #[topic]
    pub group_id: u64,
    pub index: u32,
    pub old: U256,
    pub new: U256,
    pub root: U256,
}

#[contractevent(topics = ["member_removed"], data_format = "vec")]
pub struct MemberRemoved {
    #[topic]
    pub group_id: u64,
    pub index: u32,
    pub old: U256,
    pub root: U256,
}

#[contractevent(topics = ["proof_validated"], data_format = "vec")]
pub struct ProofValidated {
    #[topic]
    pub group_id: u64,
    /// The app whose nullifier namespace this proof was spent in.
    pub caller: Address,
    pub root: U256,
    pub nullifier: U256,
    pub message: U256,
    pub scope: U256,
}

#[contract]
pub struct LihimSemaphore;

#[contractimpl]
impl LihimSemaphore {
    pub fn __constructor(env: Env, verifier: Address) {
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.storage().instance().set(&DataKey::NextGroupId, &1u64);
    }

    // ------------------------------------------------------------------
    // Admin functions (Ed25519-signed)
    // ------------------------------------------------------------------

    /// Create a group administered by `admin_key`.
    ///
    /// The signature covers `group_id = next_group_id()` and `nonce = 0`, so
    /// the client reads `next_group_id` first and signs over it. If another
    /// group is created in between, the signature no longer matches and the
    /// call fails; the client re-signs with the new id and retries. (The
    /// admin key itself is derived from the off-chain group uuid, so it does
    /// not change between attempts.)
    pub fn create_group(env: Env, admin_key: BytesN<32>, sig: BytesN<64>) -> u64 {
        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextGroupId)
            .unwrap_or(1);
        require_admin_sig(
            &env,
            &admin_key,
            &sig,
            "create_group",
            id,
            0,
            (admin_key.clone(),),
        );

        let group = Group {
            admin: admin_key.clone(),
            size: 0,
            members: 0,
            depth: 0,
            root: U256::from_u32(&env, 0),
            created_at: env.ledger().timestamp(),
        };
        let tree = Tree {
            side: Vec::new(&env),
            size: 0,
            depth: 0,
        };
        save_group(&env, id, &group);
        save_tree(&env, id, &tree);
        set_persistent(&env, &DataKey::RootTtl(id), &DEFAULT_ROOT_TTL);
        set_persistent(&env, &DataKey::Nonce(id), &1u64);
        env.storage()
            .instance()
            .set(&DataKey::NextGroupId, &(id + 1));
        bump_instance(&env);

        GroupCreated {
            group_id: id,
            admin: admin_key,
        }
        .publish(&env);
        id
    }

    pub fn add_member(
        env: Env,
        group_id: u64,
        commitment: U256,
        sig: BytesN<64>,
    ) -> Result<U256, Error> {
        let mut group = authorize(&env, group_id, &sig, "add_member", (commitment.clone(),))?;
        check_new_leaf(&env, group_id, &commitment)?;

        let mut tree = load_tree(&env, group_id);
        let index = tree.size;
        let old_root = group.root.clone();
        let old_depth = group.depth;
        let root = tree.insert(&env, &mut Hasher::new(&env), commitment.clone());

        set_persistent(
            &env,
            &DataKey::Leaf(group_id, commitment.clone()),
            &(index + 1),
        );
        group.size = tree.size;
        group.members += 1;
        commit_root(&env, group_id, &mut group, &tree, old_root, old_depth);

        MemberAdded {
            group_id,
            index,
            commitment,
            root: root.clone(),
        }
        .publish(&env);
        Ok(root)
    }

    pub fn add_members(
        env: Env,
        group_id: u64,
        commitments: Vec<U256>,
        sig: BytesN<64>,
    ) -> Result<U256, Error> {
        let mut group = authorize(&env, group_id, &sig, "add_members", (commitments.clone(),))?;
        if commitments.is_empty() {
            return Err(Error::EmptyBatch);
        }
        if commitments.len() > MAX_BATCH {
            return Err(Error::BatchTooLarge);
        }

        let mut tree = load_tree(&env, group_id);
        let start_index = tree.size;
        // Write leaf indexes as we validate so duplicates inside the batch
        // are caught too (same as zk-kit `_insertMany`). A failure reverts
        // the whole invocation, so partial writes never persist.
        for (i, c) in commitments.iter().enumerate() {
            check_new_leaf(&env, group_id, &c)?;
            set_persistent(
                &env,
                &DataKey::Leaf(group_id, c.clone()),
                &(start_index + i as u32 + 1),
            );
        }

        let old_root = group.root.clone();
        let old_depth = group.depth;
        let root = tree.insert_many(&env, &mut Hasher::new(&env), &commitments);
        group.size = tree.size;
        group.members += commitments.len();
        commit_root(&env, group_id, &mut group, &tree, old_root, old_depth);

        MembersAdded {
            group_id,
            start_index,
            commitments,
            root: root.clone(),
        }
        .publish(&env);
        Ok(root)
    }

    /// Replace a commitment (e.g. device reset without PRF). `siblings` is
    /// the LeanIMT Merkle path of `old` against the current root.
    pub fn update_member(
        env: Env,
        group_id: u64,
        old: U256,
        new: U256,
        siblings: Vec<U256>,
        sig: BytesN<64>,
    ) -> Result<U256, Error> {
        let mut group = authorize(
            &env,
            group_id,
            &sig,
            "update_member",
            (old.clone(), new.clone(), siblings.clone()),
        )?;
        check_new_leaf(&env, group_id, &new)?;
        let index = leaf_index(&env, group_id, &old)?;
        check_siblings(&env, &siblings)?;

        let mut tree = load_tree(&env, group_id);
        let old_root = group.root.clone();
        let root = tree
            .update(
                &env,
                &mut Hasher::new(&env),
                index,
                old.clone(),
                new.clone(),
                &siblings,
            )
            .map_err(Error::from)?;

        env.storage()
            .persistent()
            .remove(&DataKey::Leaf(group_id, old.clone()));
        set_persistent(&env, &DataKey::Leaf(group_id, new.clone()), &(index + 1));
        commit_root(&env, group_id, &mut group, &tree, old_root, tree.depth);

        MemberUpdated {
            group_id,
            index,
            old,
            new,
            root: root.clone(),
        }
        .publish(&env);
        Ok(root)
    }

    /// Remove a member by setting its leaf to 0. Tree size is unchanged;
    /// `members` drops by one.
    pub fn remove_member(
        env: Env,
        group_id: u64,
        old: U256,
        siblings: Vec<U256>,
        sig: BytesN<64>,
    ) -> Result<U256, Error> {
        let mut group = authorize(
            &env,
            group_id,
            &sig,
            "remove_member",
            (old.clone(), siblings.clone()),
        )?;
        let index = leaf_index(&env, group_id, &old)?;
        check_siblings(&env, &siblings)?;

        let mut tree = load_tree(&env, group_id);
        let old_root = group.root.clone();
        let root = tree
            .update(
                &env,
                &mut Hasher::new(&env),
                index,
                old.clone(),
                U256::from_u32(&env, 0),
                &siblings,
            )
            .map_err(Error::from)?;

        env.storage()
            .persistent()
            .remove(&DataKey::Leaf(group_id, old.clone()));
        group.members -= 1;
        commit_root(&env, group_id, &mut group, &tree, old_root, tree.depth);

        MemberRemoved {
            group_id,
            index,
            old,
            root: root.clone(),
        }
        .publish(&env);
        Ok(root)
    }

    // ------------------------------------------------------------------
    // Proofs (the proof is the authorization)
    // ------------------------------------------------------------------

    /// Verify `proof` against the group (current root, or a replaced root
    /// younger than `root_ttl`), then burn its nullifier in `caller`'s
    /// namespace.
    ///
    /// `caller` is the app consuming the proof and must authorize the call.
    /// A contract passes `env.current_contract_address()`, which is
    /// authorized automatically because it is the direct invoker. An account
    /// can call this too, but it can only ever spend nullifiers in its own
    /// namespace, never another app's.
    pub fn validate_proof(
        env: Env,
        caller: Address,
        group_id: u64,
        proof: Proof,
    ) -> Result<(), Error> {
        caller.require_auth();
        validate(&env, &caller, group_id, proof, false)
    }

    /// Like `validate_proof`, but accepts any root this group has ever had.
    ///
    /// For apps that pin the root they accept themselves: LihimPolls checks
    /// `proof.root == poll.frozen_root` before calling this, so members added
    /// or removed mid-poll do not invalidate the poll's root. Calling it with
    /// an old root only burns a nullifier in the caller's own namespace; it
    /// grants nothing to apps that use `validate_proof`.
    pub fn validate_frozen_proof(
        env: Env,
        caller: Address,
        group_id: u64,
        proof: Proof,
    ) -> Result<(), Error> {
        caller.require_auth();
        validate(&env, &caller, group_id, proof, true)
    }

    /// Same checks as `validate_proof` (nullifier checked in `caller`'s
    /// namespace), no auth and no state change, so it is free via
    /// simulation. `Ok(false)` means the Groth16 check itself failed.
    pub fn verify_proof(
        env: Env,
        caller: Address,
        group_id: u64,
        proof: Proof,
    ) -> Result<bool, Error> {
        check(&env, &caller, group_id, &proof, false)?;
        Ok(groth16(&env, &proof))
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    pub fn group(env: Env, group_id: u64) -> Result<Group, Error> {
        load_group(&env, group_id)
    }

    pub fn root(env: Env, group_id: u64) -> Result<U256, Error> {
        Ok(load_group(&env, group_id)?.root)
    }

    pub fn size(env: Env, group_id: u64) -> Result<u32, Error> {
        Ok(load_group(&env, group_id)?.size)
    }

    pub fn member_count(env: Env, group_id: u64) -> Result<u32, Error> {
        Ok(load_group(&env, group_id)?.members)
    }

    pub fn depth(env: Env, group_id: u64) -> Result<u32, Error> {
        Ok(load_group(&env, group_id)?.depth)
    }

    pub fn is_member(env: Env, group_id: u64, commitment: U256) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Leaf(group_id, commitment))
    }

    /// 0-based leaf index of `commitment`.
    pub fn index_of(env: Env, group_id: u64, commitment: U256) -> Result<u32, Error> {
        leaf_index(&env, group_id, &commitment)
    }

    /// Whether `nullifier` has been spent in `caller`'s namespace.
    pub fn has_nullifier(env: Env, caller: Address, group_id: u64, nullifier: U256) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(caller, group_id, nullifier))
    }

    /// Nonce the next admin signature for this group must use (0 for a
    /// group that does not exist yet).
    pub fn nonce(env: Env, group_id: u64) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::Nonce(group_id))
            .unwrap_or(0)
    }

    pub fn next_group_id(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::NextGroupId)
            .unwrap_or(1)
    }

    pub fn root_ttl(env: Env, group_id: u64) -> Result<u64, Error> {
        load_group(&env, group_id)?;
        Ok(env
            .storage()
            .persistent()
            .get(&DataKey::RootTtl(group_id))
            .unwrap_or(DEFAULT_ROOT_TTL))
    }

    /// `Some` if `root` was a root of this group and has been replaced.
    pub fn root_record(env: Env, group_id: u64, root: U256) -> Option<RootRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Root(group_id, root))
    }

    pub fn verifier(env: Env) -> Address {
        verifier(&env)
    }

    // ------------------------------------------------------------------
    // Keeper hooks (anyone may call; they only cost the caller fees)
    // ------------------------------------------------------------------

    /// Extend TTL of the group's fixed entries and the current root record.
    pub fn bump_group(env: Env, group_id: u64) -> Result<(), Error> {
        load_group(&env, group_id)?;
        bump_instance(&env);
        for key in [
            DataKey::Group(group_id),
            DataKey::Tree(group_id),
            DataKey::RootTtl(group_id),
            DataKey::Nonce(group_id),
        ] {
            bump(&env, &key);
        }
        Ok(())
    }

    /// Extend TTL of per-key entries the keeper knows about from events:
    /// `leaves` of the group, and `nullifiers` spent in `caller`'s namespace
    /// (for votes, `caller` is the LihimPolls address). Missing keys are
    /// skipped.
    pub fn bump_keys(
        env: Env,
        caller: Address,
        group_id: u64,
        leaves: Vec<U256>,
        nullifiers: Vec<U256>,
    ) {
        for l in leaves.iter() {
            bump_if_present(&env, &DataKey::Leaf(group_id, l));
        }
        for n in nullifiers.iter() {
            bump_if_present(&env, &DataKey::Nullifier(caller.clone(), group_id, n));
        }
    }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

impl From<ImtError> for Error {
    fn from(e: ImtError) -> Self {
        match e {
            ImtError::WrongSiblingNodes => Error::WrongSiblingNodes,
        }
    }
}

/// Check the admin signature for `fn_tag` at the group's current nonce and
/// advance the nonce. Returns the loaded group.
fn authorize<A: IntoVal<Env, Val>>(
    env: &Env,
    group_id: u64,
    sig: &BytesN<64>,
    fn_tag: &str,
    args: A,
) -> Result<Group, Error> {
    let group = load_group(env, group_id)?;
    let nonce_key = DataKey::Nonce(group_id);
    let nonce: u64 = env.storage().persistent().get(&nonce_key).unwrap_or(0);
    require_admin_sig(env, &group.admin, sig, fn_tag, group_id, nonce, args);
    set_persistent(env, &nonce_key, &(nonce + 1));
    Ok(group)
}

fn validate(
    env: &Env,
    caller: &Address,
    group_id: u64,
    proof: Proof,
    frozen: bool,
) -> Result<(), Error> {
    check(env, caller, group_id, &proof, frozen)?;
    if !groth16(env, &proof) {
        return Err(Error::InvalidProof);
    }
    set_persistent(
        env,
        &DataKey::Nullifier(caller.clone(), group_id, proof.nullifier.clone()),
        &(),
    );
    bump_instance(env);
    ProofValidated {
        group_id,
        caller: caller.clone(),
        root: proof.root,
        nullifier: proof.nullifier,
        message: proof.message,
        scope: proof.scope,
    }
    .publish(env);
    Ok(())
}

/// Everything except the Groth16 check, in Semaphore.sol's order, plus the
/// spec's depth-floor check. The nullifier is looked up in `caller`'s
/// namespace.
fn check(
    env: &Env,
    caller: &Address,
    group_id: u64,
    proof: &Proof,
    frozen: bool,
) -> Result<(), Error> {
    if !(MIN_DEPTH..=MAX_DEPTH).contains(&proof.depth) {
        return Err(Error::DepthNotSupported);
    }
    if proof.points.len() != PROOF_POINTS {
        return Err(Error::MalformedProof);
    }
    let group = load_group(env, group_id)?;
    if group.size == 0 {
        return Err(Error::GroupHasNoMembers);
    }

    let required_depth = if proof.root == group.root {
        group.depth
    } else {
        let rec: RootRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Root(group_id, proof.root.clone()))
            .ok_or(Error::RootNotInGroup)?;
        if !frozen {
            let ttl: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::RootTtl(group_id))
                .unwrap_or(DEFAULT_ROOT_TTL);
            if env.ledger().timestamp().saturating_sub(rec.replaced_at) >= ttl {
                return Err(Error::RootExpired);
            }
        }
        rec.depth
    };
    // A circuit for a shallower tree cannot hold this root's path.
    if proof.depth < required_depth {
        return Err(Error::DepthTooSmall);
    }

    if env.storage().persistent().has(&DataKey::Nullifier(
        caller.clone(),
        group_id,
        proof.nullifier.clone(),
    )) {
        return Err(Error::NullifierUsed);
    }
    Ok(())
}

fn groth16(env: &Env, proof: &Proof) -> bool {
    let signals = vec![
        env,
        proof.root.clone(),
        proof.nullifier.clone(),
        hash_to_field(env, &proof.message),
        hash_to_field(env, &proof.scope),
    ];
    VerifierClient::new(env, &verifier(env)).verify(&proof.depth, &proof.points, &signals)
}

fn check_new_leaf(env: &Env, group_id: u64, leaf: &U256) -> Result<(), Error> {
    if !is_fr(env, leaf) {
        return Err(Error::LeafOutOfField);
    }
    if *leaf == U256::from_u32(env, 0) {
        return Err(Error::LeafIsZero);
    }
    if env
        .storage()
        .persistent()
        .has(&DataKey::Leaf(group_id, leaf.clone()))
    {
        return Err(Error::LeafExists);
    }
    Ok(())
}

fn check_siblings(env: &Env, siblings: &Vec<U256>) -> Result<(), Error> {
    if siblings.iter().any(|s| !is_fr(env, &s)) {
        return Err(Error::FieldOutOfRange);
    }
    Ok(())
}

fn leaf_index(env: &Env, group_id: u64, leaf: &U256) -> Result<u32, Error> {
    let stored: u32 = env
        .storage()
        .persistent()
        .get(&DataKey::Leaf(group_id, leaf.clone()))
        .ok_or(Error::LeafNotFound)?;
    Ok(stored - 1)
}

/// Persist the new tree/root and move the old root into history.
fn commit_root(
    env: &Env,
    group_id: u64,
    group: &mut Group,
    tree: &Tree,
    old_root: U256,
    old_depth: u32,
) {
    // An empty tree's root (0) was never provable, so it gets no record.
    if old_root != U256::from_u32(env, 0) {
        set_persistent(
            env,
            &DataKey::Root(group_id, old_root),
            &RootRecord {
                replaced_at: env.ledger().timestamp(),
                depth: old_depth,
            },
        );
    }
    group.root = tree.root(env);
    group.depth = tree.depth;
    save_group(env, group_id, group);
    save_tree(env, group_id, tree);
    bump(env, &DataKey::RootTtl(group_id));
    bump_instance(env);
}

fn load_group(env: &Env, group_id: u64) -> Result<Group, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Group(group_id))
        .ok_or(Error::GroupNotFound)
}

fn save_group(env: &Env, group_id: u64, group: &Group) {
    set_persistent(env, &DataKey::Group(group_id), group);
}

fn load_tree(env: &Env, group_id: u64) -> Tree {
    let group = load_group(env, group_id).unwrap();
    Tree {
        side: env
            .storage()
            .persistent()
            .get(&DataKey::Tree(group_id))
            .unwrap_or_else(|| Vec::new(env)),
        size: group.size,
        depth: group.depth,
    }
}

fn save_tree(env: &Env, group_id: u64, tree: &Tree) {
    set_persistent(env, &DataKey::Tree(group_id), &tree.side);
}

fn verifier(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Verifier).unwrap()
}

fn set_persistent<V: IntoVal<Env, Val>>(env: &Env, key: &DataKey, val: &V) {
    env.storage().persistent().set(key, val);
    bump(env, key);
}

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, BUMP_THRESHOLD, BUMP_AMOUNT);
}

fn bump_if_present(env: &Env, key: &DataKey) {
    if env.storage().persistent().has(key) {
        bump(env, key);
    }
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
}

#[cfg(test)]
mod test;

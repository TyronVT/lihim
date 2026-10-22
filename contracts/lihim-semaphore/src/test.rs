extern crate std;

use super::*;
use crate::imt::Hasher;
use ed25519_dalek::SigningKey;
use lihim_common::admin_digest;
use lihim_common::testutils::{admin_key, public_key, sign};
use soroban_sdk::{
    bytesn, contract, contractimpl,
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Events as _, Ledger as _},
    vec,
    xdr::ToXdr,
    Bytes, Env, IntoVal, Symbol,
};
use std::vec::Vec as StdVec;

// ---------------------------------------------------------------------------
// Mock verifier: returns a configurable bool and records what it was asked.
// ---------------------------------------------------------------------------

#[contracttype]
enum MockKey {
    Result,
    Last,
}

#[contract]
pub struct MockVerifier;

#[contractimpl]
impl MockVerifier {
    pub fn set_result(env: Env, ok: bool) {
        env.storage().instance().set(&MockKey::Result, &ok);
    }

    pub fn verify(env: Env, depth: u32, _points: Vec<U256>, signals: Vec<U256>) -> bool {
        env.storage()
            .instance()
            .set(&MockKey::Last, &(depth, signals));
        env.storage()
            .instance()
            .get(&MockKey::Result)
            .unwrap_or(true)
    }

    pub fn last(env: Env) -> Option<(u32, Vec<U256>)> {
        env.storage().instance().get(&MockKey::Last)
    }
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

struct Fx {
    env: Env,
    sem: LihimSemaphoreClient<'static>,
    mock: MockVerifierClient<'static>,
    key: SigningKey,
    /// The app address proofs are validated for (its nullifier namespace).
    app: Address,
}

impl Fx {
    fn new() -> Self {
        let env = Env::default();
        // Poseidon over many leaves is heavier than the default test budget
        // assumes; cost is measured separately in `measure_costs`.
        env.cost_estimate().budget().reset_unlimited();
        env.ledger().set_timestamp(1_000_000);
        let mock_id = env.register(MockVerifier, ());
        let sem_id = env.register(LihimSemaphore, (mock_id.clone(),));
        // `caller.require_auth()` in the proof functions; admin functions
        // use Ed25519 signatures and are unaffected. Tests that check the
        // auth itself call `set_auths(&[])` first.
        env.mock_all_auths();
        Fx {
            sem: LihimSemaphoreClient::new(&env, &sem_id),
            mock: MockVerifierClient::new(&env, &mock_id),
            key: admin_key(7),
            app: Address::generate(&env),
            env,
        }
    }

    fn admin(&self) -> BytesN<32> {
        public_key(&self.env, &self.key)
    }

    fn sign<A: IntoVal<Env, Val>>(
        &self,
        tag: &str,
        group_id: u64,
        nonce: u64,
        args: A,
    ) -> BytesN<64> {
        sign(
            &self.env,
            &self.key,
            &self.sem.address,
            tag,
            group_id,
            nonce,
            args,
        )
    }

    fn create_group(&self) -> u64 {
        let id = self.sem.next_group_id();
        let admin = self.admin();
        let sig = self.sign("create_group", id, 0, (admin.clone(),));
        self.sem.create_group(&admin, &sig)
    }

    fn add(&self, id: u64, c: &U256) -> U256 {
        let sig = self.sign("add_member", id, self.sem.nonce(&id), (c.clone(),));
        self.sem.add_member(&id, c, &sig)
    }

    fn add_many(&self, id: u64, cs: &Vec<U256>) -> U256 {
        let sig = self.sign("add_members", id, self.sem.nonce(&id), (cs.clone(),));
        self.sem.add_members(&id, cs, &sig)
    }

    fn update(&self, id: u64, old: &U256, new: &U256, sibs: &Vec<U256>) -> U256 {
        let n = self.sem.nonce(&id);
        let sig = self.sign(
            "update_member",
            id,
            n,
            (old.clone(), new.clone(), sibs.clone()),
        );
        self.sem.update_member(&id, old, new, sibs, &sig)
    }

    fn remove(&self, id: u64, old: &U256, sibs: &Vec<U256>) -> U256 {
        let n = self.sem.nonce(&id);
        let sig = self.sign("remove_member", id, n, (old.clone(), sibs.clone()));
        self.sem.remove_member(&id, old, sibs, &sig)
    }

    fn u(&self, n: u32) -> U256 {
        U256::from_u32(&self.env, n)
    }

    fn proof(&self, root: U256, nullifier: u32, scope: u32, depth: u32) -> Proof {
        Proof {
            depth,
            root,
            nullifier: self.u(nullifier),
            message: self.u(0),
            scope: self.u(scope),
            points: Vec::from_array(
                &self.env,
                core::array::from_fn::<_, 8, _>(|i| self.u(i as u32 + 1)),
            ),
        }
    }
}

// Independent LeanIMT reference: full recomputation from the leaf list,
// carrying odd nodes up unchanged. Used to check the incremental port.
fn reference_levels(env: &Env, leaves: &StdVec<U256>) -> StdVec<StdVec<U256>> {
    let mut h = Hasher::new(env);
    let mut levels = std::vec![leaves.clone()];
    while levels.last().unwrap().len() > 1 {
        let next = levels
            .last()
            .unwrap()
            .chunks(2)
            .map(|c| {
                if c.len() == 2 {
                    h.hash(&c[0], &c[1])
                } else {
                    c[0].clone()
                }
            })
            .collect();
        levels.push(next);
    }
    levels
}

fn reference_root(env: &Env, leaves: &StdVec<U256>) -> U256 {
    reference_levels(env, leaves).last().unwrap()[0].clone()
}

/// LeanIMT Merkle path: siblings only where one exists.
fn reference_siblings(env: &Env, leaves: &StdVec<U256>, index: usize) -> Vec<U256> {
    let levels = reference_levels(env, leaves);
    let mut out = Vec::new(env);
    let mut idx = index;
    for level in &levels[..levels.len() - 1] {
        if let Some(s) = level.get(idx ^ 1) {
            out.push_back(s.clone());
        }
        idx >>= 1;
    }
    out
}

fn commitments(env: &Env, from: u32, n: u32) -> StdVec<U256> {
    (from..from + n)
        .map(|i| U256::from_u32(env, 1000 + i))
        .collect()
}

fn to_vec(env: &Env, v: &[U256]) -> Vec<U256> {
    let mut out = Vec::new(env);
    for x in v {
        out.push_back(x.clone());
    }
    out
}

// ---------------------------------------------------------------------------
// Groups and admin auth
// ---------------------------------------------------------------------------

#[test]
fn create_group_assigns_sequential_ids_and_emits_event() {
    let fx = Fx::new();
    let id = fx.create_group();
    assert_eq!(id, 1);
    assert_eq!(
        fx.env.events().all(),
        vec![
            &fx.env,
            (
                fx.sem.address.clone(),
                (Symbol::new(&fx.env, "group_created"), id).into_val(&fx.env),
                Vec::<Val>::from_array(&fx.env, [fx.admin().into_val(&fx.env)]).into_val(&fx.env),
            )
        ]
    );
    let g = fx.sem.group(&id);
    assert_eq!(g.admin, fx.admin());
    assert_eq!((g.size, g.members, g.depth), (0, 0, 0));
    assert_eq!(g.root, fx.u(0));
    assert_eq!(fx.sem.nonce(&id), 1);
    assert_eq!(fx.sem.root_ttl(&id), DEFAULT_ROOT_TTL);
    assert_eq!(fx.create_group(), 2);
}

#[test]
fn admin_digest_matches_documented_layout() {
    // Rebuild the digest by hand from the README layout so the helper the
    // contracts use cannot silently drift from what the SDK implements.
    let fx = Fx::new();
    let env = &fx.env;
    let c = fx.u(42);
    let mut pre = Bytes::new(env);
    let strkey = fx.sem.address.to_string();
    let mut buf = [0u8; 56];
    strkey.copy_into_slice(&mut buf);
    assert_eq!(buf[0], b'C');
    pre.append(&Bytes::from_array(env, &buf));
    pre.append(&Bytes::from_slice(env, b"add_member"));
    pre.append(&Bytes::from_array(env, &7u64.to_be_bytes()));
    pre.append(&Bytes::from_array(env, &3u64.to_be_bytes()));
    let args: Vec<Val> = vec![env, c.into_val(env)];
    pre.append(&args.to_xdr(env));
    let expected = env.crypto().sha256(&pre).to_bytes();
    assert_eq!(
        admin_digest(env, &fx.sem.address, "add_member", 7, 3, (c.clone(),)),
        expected
    );
}

#[test]
fn add_member_requires_valid_admin_signature() {
    let fx = Fx::new();
    let id = fx.create_group();
    let c = fx.u(5);
    // Signed by a different key.
    let other = admin_key(9);
    let sig = sign(
        &fx.env,
        &other,
        &fx.sem.address,
        "add_member",
        id,
        1,
        (c.clone(),),
    );
    assert!(fx.sem.try_add_member(&id, &c, &sig).is_err());
    // Right key, wrong function tag.
    let sig = fx.sign("add_members", id, 1, (c.clone(),));
    assert!(fx.sem.try_add_member(&id, &c, &sig).is_err());
    // Right key, signed for another contract address.
    let other_contract = fx.env.register(MockVerifier, ());
    let sig = sign(
        &fx.env,
        &fx.key,
        &other_contract,
        "add_member",
        id,
        1,
        (c.clone(),),
    );
    assert!(fx.sem.try_add_member(&id, &c, &sig).is_err());
    // Right key, different argument.
    let sig = fx.sign("add_member", id, 1, (fx.u(6),));
    assert!(fx.sem.try_add_member(&id, &c, &sig).is_err());
    assert_eq!(fx.sem.size(&id), 0);
    // Correct.
    let sig = fx.sign("add_member", id, 1, (c.clone(),));
    fx.sem.add_member(&id, &c, &sig);
    assert_eq!(fx.sem.size(&id), 1);
}

#[test]
fn nonce_replay_rejected() {
    let fx = Fx::new();
    let id = fx.create_group();
    let c = fx.u(5);
    let sig = fx.sign("add_member", id, 1, (c.clone(),));
    fx.sem.add_member(&id, &c, &sig);
    assert_eq!(fx.sem.nonce(&id), 2);
    // Same signed call again: nonce moved on, so the signature is stale.
    // (It would also fail as a duplicate leaf; use a remove+re-add shaped
    // replay to isolate the nonce check.)
    let sibs = Vec::new(&fx.env);
    let rm = fx.sign("remove_member", id, 2, (c.clone(), sibs.clone()));
    fx.sem.remove_member(&id, &c, &sibs, &rm);
    assert!(!fx.sem.is_member(&id, &c));
    assert!(fx.sem.try_add_member(&id, &c, &sig).is_err());
    // A failed call does not consume the nonce.
    assert_eq!(fx.sem.nonce(&id), 3);
}

#[test]
fn create_group_signature_binds_group_id() {
    let fx = Fx::new();
    let admin = fx.admin();
    // Signed for id 2 while next id is 1.
    let sig = fx.sign("create_group", 2, 0, (admin.clone(),));
    assert!(fx.sem.try_create_group(&admin, &sig).is_err());
    assert_eq!(fx.sem.next_group_id(), 1);
}

// ---------------------------------------------------------------------------
// LeanIMT
// ---------------------------------------------------------------------------

#[test]
fn poseidon_matches_circomlib_vector() {
    // circomlibjs poseidon([1, 2]); also the soroban-poseidon doc vector.
    let env = Env::default();
    let mut h = Hasher::new(&env);
    let got = h.hash(&U256::from_u32(&env, 1), &U256::from_u32(&env, 2));
    let want = U256::from_be_bytes(
        &env,
        &bytesn!(
            &env,
            0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a
        )
        .into(),
    );
    assert_eq!(got, want);
}

#[test]
fn keccak_hash_matches_known_vector() {
    // keccak256(32 zero bytes) = 0x290decd9...e563; Semaphore hash = that >> 8.
    let env = Env::default();
    let want = U256::from_be_bytes(
        &env,
        &bytesn!(
            &env,
            0x00290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e5
        )
        .into(),
    );
    assert_eq!(hash_to_field(&env, &U256::from_u32(&env, 0)), want);
}

#[test]
fn add_member_root_changes_and_matches_reference() {
    let fx = Fx::new();
    let id = fx.create_group();
    let mut leaves = StdVec::new();
    let mut prev = fx.u(0);
    for c in commitments(&fx.env, 0, 9) {
        let root = fx.add(id, &c);
        leaves.push(c.clone());
        assert_ne!(root, prev, "root must change on insert");
        assert_eq!(root, reference_root(&fx.env, &leaves));
        assert_eq!(fx.sem.root(&id), root);
        prev = root;
    }
    let g = fx.sem.group(&id);
    assert_eq!((g.size, g.members, g.depth), (9, 9, 4));
    assert_eq!(fx.sem.index_of(&id, &leaves[3]), 3);
    assert!(fx.sem.is_member(&id, &leaves[8]));
    // A one-leaf tree has depth 0 and root = leaf.
    let id2 = fx.create_group();
    assert_eq!(fx.add(id2, &fx.u(77)), fx.u(77));
}

#[test]
fn member_added_event_shape() {
    let fx = Fx::new();
    let id = fx.create_group();
    let c = fx.u(5);
    let root = fx.add(id, &c);
    assert_eq!(
        fx.env.events().all(),
        vec![
            &fx.env,
            (
                fx.sem.address.clone(),
                (Symbol::new(&fx.env, "member_added"), id).into_val(&fx.env),
                Vec::<Val>::from_array(
                    &fx.env,
                    [
                        0u32.into_val(&fx.env),
                        c.into_val(&fx.env),
                        root.into_val(&fx.env)
                    ],
                )
                .into_val(&fx.env),
            )
        ]
    );
}

#[test]
fn add_members_batch_matches_reference_and_single_inserts() {
    let fx = Fx::new();
    // Batches that straddle depth changes and odd/even boundaries.
    for (pre, batch) in [(0u32, 1u32), (0, 7), (3, 5), (5, 11), (8, 8), (1, 31)] {
        let id = fx.create_group();
        let mut leaves = commitments(&fx.env, 0, pre);
        for c in &leaves {
            fx.add(id, c);
        }
        let more = commitments(&fx.env, pre, batch);
        let root = fx.add_many(id, &to_vec(&fx.env, &more));
        leaves.extend(more);
        assert_eq!(
            root,
            reference_root(&fx.env, &leaves),
            "pre={pre} batch={batch}"
        );
        assert_eq!(fx.sem.size(&id), pre + batch);
        // Side nodes must be left consistent for later single inserts.
        let next = fx.u(9_999);
        leaves.push(next.clone());
        assert_eq!(fx.add(id, &next), reference_root(&fx.env, &leaves));
    }
}

#[test]
fn add_members_rejects_duplicates_zero_and_empty() {
    let fx = Fx::new();
    let id = fx.create_group();
    let env = &fx.env;
    let dup = vec![env, fx.u(1), fx.u(2), fx.u(1)];
    let sig = fx.sign("add_members", id, 1, (dup.clone(),));
    assert_eq!(
        fx.sem.try_add_members(&id, &dup, &sig),
        Err(Ok(Error::LeafExists))
    );
    let zero = vec![env, fx.u(0)];
    let sig = fx.sign("add_members", id, 1, (zero.clone(),));
    assert_eq!(
        fx.sem.try_add_members(&id, &zero, &sig),
        Err(Ok(Error::LeafIsZero))
    );
    let empty: Vec<U256> = vec![env];
    let sig = fx.sign("add_members", id, 1, (empty.clone(),));
    assert_eq!(
        fx.sem.try_add_members(&id, &empty, &sig),
        Err(Ok(Error::EmptyBatch))
    );
    let big = vec![env, lihim_common::fr_modulus(env)];
    let sig = fx.sign("add_members", id, 1, (big.clone(),));
    assert_eq!(
        fx.sem.try_add_members(&id, &big, &sig),
        Err(Ok(Error::LeafOutOfField))
    );
    // Nothing persisted from the failed batches.
    assert_eq!(fx.sem.size(&id), 0);
    assert!(!fx.sem.is_member(&id, &fx.u(1)));
}

#[test]
fn update_and_remove_match_reference() {
    let fx = Fx::new();
    let id = fx.create_group();
    let mut leaves = commitments(&fx.env, 0, 11);
    fx.add_many(id, &to_vec(&fx.env, &leaves));

    // Update a middle leaf, the last leaf, and a left child of the last pair.
    for idx in [4usize, 10, 9, 0] {
        let new = fx.u(50_000 + idx as u32);
        let sibs = reference_siblings(&fx.env, &leaves, idx);
        let old = leaves[idx].clone();
        let root = fx.update(id, &old, &new, &sibs);
        leaves[idx] = new.clone();
        assert_eq!(root, reference_root(&fx.env, &leaves), "update idx={idx}");
        assert!(!fx.sem.is_member(&id, &old));
        assert_eq!(fx.sem.index_of(&id, &new), idx as u32);
    }

    // Remove: leaf becomes 0, size stays, members drops.
    let idx = 6;
    let sibs = reference_siblings(&fx.env, &leaves, idx);
    let old = leaves[idx].clone();
    let root = fx.remove(id, &old, &sibs);
    leaves[idx] = fx.u(0);
    assert_eq!(root, reference_root(&fx.env, &leaves));
    let g = fx.sem.group(&id);
    assert_eq!((g.size, g.members), (11, 10));
    assert!(!fx.sem.is_member(&id, &old));

    // Later inserts still agree (side nodes stayed consistent).
    let next = fx.u(77_777);
    leaves.push(next.clone());
    assert_eq!(fx.add(id, &next), reference_root(&fx.env, &leaves));
}

#[test]
fn update_with_wrong_siblings_rejected() {
    let fx = Fx::new();
    let id = fx.create_group();
    let leaves = commitments(&fx.env, 0, 5);
    fx.add_many(id, &to_vec(&fx.env, &leaves));
    let mut sibs = reference_siblings(&fx.env, &leaves, 2);
    sibs.set(0, fx.u(123));
    let n = fx.sem.nonce(&id);
    let sig = fx.sign(
        "update_member",
        id,
        n,
        (leaves[2].clone(), fx.u(9), sibs.clone()),
    );
    assert_eq!(
        fx.sem
            .try_update_member(&id, &leaves[2], &fx.u(9), &sibs, &sig),
        Err(Ok(Error::WrongSiblingNodes))
    );
    assert_eq!(fx.sem.root(&id), reference_root(&fx.env, &leaves));
}

// ---------------------------------------------------------------------------
// Proofs
// ---------------------------------------------------------------------------

fn group_with(fx: &Fx, n: u32) -> (u64, U256) {
    let id = fx.create_group();
    let root = fx.add_many(id, &to_vec(&fx.env, &commitments(&fx.env, 0, n)));
    (id, root)
}

#[test]
fn validate_proof_happy_path_passes_semaphore_signals() {
    let fx = Fx::new();
    let (id, root) = group_with(&fx, 4); // depth 2
    let p = fx.proof(root.clone(), 77, 5, 2);
    assert!(fx.sem.verify_proof(&fx.app, &id, &p));
    fx.sem.validate_proof(&fx.app, &id, &p);
    // events().all() covers only the latest invocation, so check it first.
    assert_eq!(
        fx.env.events().all().filter_by_contract(&fx.sem.address),
        vec![
            &fx.env,
            (
                fx.sem.address.clone(),
                (Symbol::new(&fx.env, "proof_validated"), id).into_val(&fx.env),
                Vec::<Val>::from_array(
                    &fx.env,
                    [
                        fx.app.into_val(&fx.env),
                        root.into_val(&fx.env),
                        fx.u(77).into_val(&fx.env),
                        fx.u(0).into_val(&fx.env),
                        fx.u(5).into_val(&fx.env)
                    ],
                )
                .into_val(&fx.env),
            )
        ]
    );
    assert!(fx.sem.has_nullifier(&fx.app, &id, &fx.u(77)));
    let (depth, signals) = fx.mock.last().unwrap();
    assert_eq!(depth, 2);
    assert_eq!(
        signals,
        vec![
            &fx.env,
            root,
            fx.u(77),
            hash_to_field(&fx.env, &fx.u(0)),
            hash_to_field(&fx.env, &fx.u(5))
        ]
    );
}

#[test]
fn nullifier_double_use_rejected() {
    let fx = Fx::new();
    let (id, root) = group_with(&fx, 4);
    let p = fx.proof(root, 77, 5, 2);
    fx.sem.validate_proof(&fx.app, &id, &p);
    assert_eq!(
        fx.sem.try_validate_proof(&fx.app, &id, &p),
        Err(Ok(Error::NullifierUsed))
    );
    assert_eq!(
        fx.sem.try_verify_proof(&fx.app, &id, &p),
        Err(Ok(Error::NullifierUsed))
    );
}

#[test]
fn nullifiers_are_namespaced_by_caller() {
    let fx = Fx::new();
    let (id, root) = group_with(&fx, 4);
    let p = fx.proof(root, 77, 5, 2);
    let other = Address::generate(&fx.env);
    // A front-runner spends the proof in its own namespace...
    fx.sem.validate_frozen_proof(&other, &id, &p);
    assert!(fx.sem.has_nullifier(&other, &id, &fx.u(77)));
    // ...which leaves the app's namespace untouched.
    assert!(!fx.sem.has_nullifier(&fx.app, &id, &fx.u(77)));
    assert!(fx.sem.verify_proof(&fx.app, &id, &p));
    fx.sem.validate_frozen_proof(&fx.app, &id, &p);
    assert!(fx.sem.has_nullifier(&fx.app, &id, &fx.u(77)));
    // Re-use inside either namespace is still rejected.
    for caller in [&fx.app, &other] {
        assert_eq!(
            fx.sem.try_validate_frozen_proof(caller, &id, &p),
            Err(Ok(Error::NullifierUsed))
        );
    }
}

#[test]
fn validate_requires_caller_auth() {
    let fx = Fx::new();
    let (id, root) = group_with(&fx, 4);
    let p = fx.proof(root, 77, 5, 2);
    fx.sem.validate_proof(&fx.app, &id, &p);
    // The auth the call needed: exactly `caller` for this invocation.
    assert_eq!(
        fx.env.auths(),
        std::vec![(
            fx.app.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    fx.sem.address.clone(),
                    Symbol::new(&fx.env, "validate_proof"),
                    (fx.app.clone(), id, p.clone()).into_val(&fx.env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
    // Without that auth, nobody can spend a nullifier in `caller`'s
    // namespace (here: the test harness impersonating the app).
    fx.env.set_auths(&[]);
    let p2 = fx.proof(fx.sem.root(&id), 78, 5, 2);
    assert!(fx.sem.try_validate_proof(&fx.app, &id, &p2).is_err());
    assert!(fx.sem.try_validate_frozen_proof(&fx.app, &id, &p2).is_err());
    assert!(!fx.sem.has_nullifier(&fx.app, &id, &fx.u(78)));
    // The view needs no auth.
    assert!(fx.sem.verify_proof(&fx.app, &id, &p2));
}

#[test]
fn invalid_groth16_rejected() {
    let fx = Fx::new();
    let (id, root) = group_with(&fx, 4);
    fx.mock.set_result(&false);
    let p = fx.proof(root, 77, 5, 2);
    assert!(!fx.sem.verify_proof(&fx.app, &id, &p));
    assert_eq!(
        fx.sem.try_validate_proof(&fx.app, &id, &p),
        Err(Ok(Error::InvalidProof))
    );
    assert!(!fx.sem.has_nullifier(&fx.app, &id, &fx.u(77)));
}

#[test]
fn depth_checks() {
    let fx = Fx::new();
    let (id, root) = group_with(&fx, 9); // depth 4
    for d in [0u32, 33] {
        let p = fx.proof(root.clone(), 1, 1, d);
        assert_eq!(
            fx.sem.try_validate_proof(&fx.app, &id, &p),
            Err(Ok(Error::DepthNotSupported))
        );
    }
    let p = fx.proof(root.clone(), 1, 1, 3);
    assert_eq!(
        fx.sem.try_validate_proof(&fx.app, &id, &p),
        Err(Ok(Error::DepthTooSmall))
    );
    // A deeper circuit than needed is fine (Semaphore pads the path).
    fx.sem
        .validate_proof(&fx.app, &id, &fx.proof(root, 1, 1, 10));
}

#[test]
fn root_history_and_ttl() {
    let fx = Fx::new();
    let (id, old_root) = group_with(&fx, 4);
    fx.add(id, &fx.u(5_000)); // replaces old_root at t = 1_000_000
    let rec = fx.sem.root_record(&id, &old_root).unwrap();
    assert_eq!(
        rec,
        RootRecord {
            replaced_at: 1_000_000,
            depth: 2
        }
    );

    // Within ttl: old root ok.
    fx.env
        .ledger()
        .set_timestamp(1_000_000 + DEFAULT_ROOT_TTL - 1);
    fx.sem
        .validate_proof(&fx.app, &id, &fx.proof(old_root.clone(), 1, 1, 2));
    // At/after ttl: expired for validate_proof...
    fx.env.ledger().set_timestamp(1_000_000 + DEFAULT_ROOT_TTL);
    assert_eq!(
        fx.sem
            .try_validate_proof(&fx.app, &id, &fx.proof(old_root.clone(), 2, 1, 2)),
        Err(Ok(Error::RootExpired))
    );
    // ...but still accepted on the frozen path, with its recorded depth floor.
    fx.sem
        .validate_frozen_proof(&fx.app, &id, &fx.proof(old_root.clone(), 2, 1, 2));
    // Never a root of this group:
    assert_eq!(
        fx.sem
            .try_validate_frozen_proof(&fx.app, &id, &fx.proof(fx.u(31337), 3, 1, 2)),
        Err(Ok(Error::RootNotInGroup))
    );
}

#[test]
fn empty_group_and_unknown_group() {
    let fx = Fx::new();
    let id = fx.create_group();
    assert_eq!(
        fx.sem
            .try_validate_proof(&fx.app, &id, &fx.proof(fx.u(0), 1, 1, 1)),
        Err(Ok(Error::GroupHasNoMembers))
    );
    assert_eq!(
        fx.sem
            .try_validate_proof(&fx.app, &99, &fx.proof(fx.u(0), 1, 1, 1)),
        Err(Ok(Error::GroupNotFound))
    );
    let mut p = fx.proof(fx.u(0), 1, 1, 1);
    p.points.pop_back();
    assert_eq!(
        fx.sem.try_validate_proof(&fx.app, &id, &p),
        Err(Ok(Error::MalformedProof))
    );
}

#[test]
fn keeper_bumps_do_not_fail() {
    let fx = Fx::new();
    let (id, root) = group_with(&fx, 2);
    fx.sem
        .validate_proof(&fx.app, &id, &fx.proof(root, 9, 1, 1));
    fx.sem.bump_group(&id);
    fx.sem.bump_keys(
        &fx.app,
        &id,
        &vec![&fx.env, fx.u(1000), fx.u(424242)],
        &vec![&fx.env, fx.u(9), fx.u(10)],
    );
}

// ---------------------------------------------------------------------------
// Cost measurement (run: cargo test -p lihim-semaphore measure_costs -- --ignored --nocapture)
// ---------------------------------------------------------------------------

#[test]
#[ignore = "prints budget numbers; not an assertion"]
fn measure_costs() {
    let fx = Fx::new();
    let id = fx.create_group();
    // Fill to 1024 leaves so per-insert cost reflects a depth-10 tree.
    for chunk in 0..32 {
        fx.add_many(id, &to_vec(&fx.env, &commitments(&fx.env, chunk * 32, 32)));
    }
    let mut budget = fx.env.cost_estimate().budget();
    budget.reset_unlimited();
    fx.add(id, &fx.u(123_456_789));
    std::println!(
        "add_member @1024 leaves (depth 11): cpu={} mem={}",
        budget.cpu_instruction_cost(),
        budget.memory_bytes_cost()
    );
    for n in [1u32, 10, 20, 32] {
        budget.reset_unlimited();
        fx.add_many(
            id,
            &to_vec(&fx.env, &commitments(&fx.env, 200_000 + n * 1000, n)),
        );
        std::println!(
            "add_members batch={n}: cpu={} mem={}",
            budget.cpu_instruction_cost(),
            budget.memory_bytes_cost()
        );
    }
}

// ---------------------------------------------------------------------------
// M0 gates: vectors generated from the official JS libraries by
// test-vectors/generate.mjs (see test-vectors/README.md).
// ---------------------------------------------------------------------------

use lihim_common::testutils::u256_dec;
use serde_json::Value;

fn vectors(name: &str) -> Value {
    let path = std::format!("{}/../test-vectors/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn dec(env: &Env, v: &Value) -> U256 {
    u256_dec(env, v.as_str().unwrap())
}

/// M0 acceptance 1: contract Poseidon == poseidon-lite poseidon2 (circomlib
/// params, as used by @zk-kit/lean-imt) on 20 vectors.
#[test]
fn m0_poseidon_20_vectors() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let mut h = Hasher::new(&env);
    let v = vectors("poseidon.json");
    let cases = v.as_array().unwrap();
    assert_eq!(cases.len(), 20);
    for c in cases {
        assert_eq!(
            h.hash(&dec(&env, &c["a"]), &dec(&env, &c["b"])),
            dec(&env, &c["hash"]),
            "{c}"
        );
    }
}

/// M0 acceptance 2: on-chain LeanIMT of 10 commitments has the same root as
/// @semaphore-protocol/group, after every insert, as a batch, and after an
/// update and a removal.
#[test]
fn m0_leanimt_10_commitments_root() {
    let fx = Fx::new();
    let env = &fx.env;
    let v = vectors("leanimt.json");
    let inserts = v["inserts"].as_array().unwrap();
    assert_eq!(inserts.len(), 10);

    let one_by_one = fx.create_group();
    let mut all = Vec::new(env);
    for step in inserts {
        let c = dec(env, &step["commitment"]);
        all.push_back(c.clone());
        assert_eq!(fx.add(one_by_one, &c), dec(env, &step["root"]));
        assert_eq!(
            fx.sem.depth(&one_by_one),
            step["depth"].as_u64().unwrap() as u32
        );
    }

    let batched = fx.create_group();
    assert_eq!(fx.add_many(batched, &all), dec(env, &inserts[9]["root"]));

    let u = &v["update"];
    let sibs: Vec<U256> = to_vec(
        env,
        &u["siblings"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| dec(env, x))
            .collect::<StdVec<_>>(),
    );
    let root = fx.update(batched, &dec(env, &u["old"]), &dec(env, &u["new"]), &sibs);
    assert_eq!(root, dec(env, &u["root"]));

    let r = &v["remove"];
    let sibs: Vec<U256> = to_vec(
        env,
        &r["siblings"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| dec(env, x))
            .collect::<StdVec<_>>(),
    );
    let root = fx.remove(batched, &dec(env, &r["old"]), &sibs);
    assert_eq!(root, dec(env, &r["root"]));
}

/// M0 acceptance 3: hash(x) = keccak256(be32(x)) >> 8 matches the JS library.
#[test]
fn m0_keccak_hash_10_vectors() {
    let env = Env::default();
    let v = vectors("keccak.json");
    let cases = v.as_array().unwrap();
    assert_eq!(cases.len(), 10);
    for c in cases {
        assert_eq!(
            hash_to_field(&env, &dec(&env, &c["x"])),
            dec(&env, &c["hash"]),
            "{c}"
        );
    }
}

// ---------------------------------------------------------------------------
// Admin-auth known-answer vectors for the TypeScript SDK
// (test-vectors/admin-auth.json). Regenerate with:
//   LIHIM_WRITE_VECTORS=1 cargo test -p lihim-semaphore admin_auth_vectors
// ---------------------------------------------------------------------------

fn hex(b: &[u8]) -> std::string::String {
    b.iter().map(|x| std::format!("{x:02x}")).collect()
}

#[test]
fn admin_auth_vectors() {
    use ed25519_dalek::Signer;
    use lihim_common::PollKind;
    use soroban_sdk::Address;

    let env = Env::default();
    let contract_strkey = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4";
    let contract = Address::from_str(&env, contract_strkey);
    let key = admin_key(7);
    let u = |n: u32| U256::from_u32(&env, n);
    let sibs = vec![&env, u(11), u(12)];

    let cases: StdVec<(&str, u64, u64, Val)> = std::vec![
        (
            "create_group",
            1,
            0,
            (public_key(&env, &key),).into_val(&env)
        ),
        ("add_member", 1, 1, (u(42),).into_val(&env)),
        (
            "add_members",
            1,
            2,
            (vec![&env, u(1), u(2), u(3)],).into_val(&env)
        ),
        (
            "update_member",
            1,
            3,
            (u(1), u(4), sibs.clone()).into_val(&env)
        ),
        ("remove_member", 1, 4, (u(2), sibs.clone()).into_val(&env)),
        (
            "create_poll",
            1,
            0,
            (
                PollKind::Single(3),
                1_700_000_000u64,
                BytesN::from_array(&env, &[9u8; 32])
            )
                .into_val(&env),
        ),
        (
            "create_poll",
            1,
            1,
            (
                PollKind::YesNo,
                1_700_000_000u64,
                BytesN::from_array(&env, &[9u8; 32])
            )
                .into_val(&env)
        ),
        (
            "create_poll",
            1,
            2,
            (
                PollKind::Rating,
                1_700_000_000u64,
                BytesN::from_array(&env, &[9u8; 32])
            )
                .into_val(&env)
        ),
    ];

    let mut out = StdVec::new();
    for (tag, gid, nonce, args) in cases {
        let digest = admin_digest(&env, &contract, tag, gid, nonce, args);
        let sig = key.sign(&digest.to_array());
        let args_xdr = args.to_xdr(&env);
        let mut xdr = std::vec![0u8; args_xdr.len() as usize];
        args_xdr.copy_into_slice(&mut xdr);
        out.push(serde_json::json!({
            "contract": contract_strkey,
            "fn_tag": tag,
            "group_id": std::format!("{gid}"),
            "nonce": std::format!("{nonce}"),
            "args_xdr_hex": hex(&xdr),
            "digest_hex": hex(&digest.to_array()),
            "admin_seed_hex": hex(&[7u8; 32]),
            "admin_pub_hex": hex(&key.verifying_key().to_bytes()),
            "signature_hex": hex(&sig.to_bytes()),
        }));
        // The contract-side check accepts it.
        env.crypto().ed25519_verify(
            &public_key(&env, &key),
            &digest.into(),
            &BytesN::from_array(&env, &sig.to_bytes()),
        );
    }
    let json = serde_json::to_string_pretty(&out).unwrap() + "\n";
    let path = std::format!(
        "{}/../test-vectors/admin-auth.json",
        env!("CARGO_MANIFEST_DIR")
    );
    if std::env::var("LIHIM_WRITE_VECTORS").is_ok() {
        std::fs::write(&path, &json).unwrap();
    } else {
        let on_disk = std::fs::read_to_string(&path).expect("missing admin-auth.json; regenerate");
        assert_eq!(on_disk, json, "admin-auth.json is stale; regenerate");
    }
}

// ---------------------------------------------------------------------------
// ScVal / ledger-key known-answer vectors for the SDK, relay and keeper
// (test-vectors/scval.json, documented in INTERFACE.md). Regenerate with:
//   LIHIM_WRITE_VECTORS=1 cargo test -p lihim-semaphore scval_vectors
// Cross-check from JS: node test-vectors/check-js.mjs --deps <dir>
// ---------------------------------------------------------------------------

const SEMAPHORE_STRKEY: &str = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";
const POLLS_STRKEY: &str = "CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ";
const VERIFIER_STRKEY: &str = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4";

fn xdr_hex<T: soroban_sdk::xdr::WriteXdr>(v: &T) -> std::string::String {
    hex(&v.to_xdr(soroban_sdk::xdr::Limits::none()).unwrap())
}

fn scval(env: &Env, v: Val) -> soroban_sdk::xdr::ScVal {
    use soroban_sdk::TryFromVal;
    soroban_sdk::xdr::ScVal::try_from_val(env, &v).unwrap()
}

/// `LedgerKey::ContractData { contract, key, durability: Persistent }`.
fn persistent_key(contract: &Address, key: soroban_sdk::xdr::ScVal) -> soroban_sdk::xdr::LedgerKey {
    use soroban_sdk::xdr::{ContractDataDurability, LedgerKey, LedgerKeyContractData, ScAddress};
    LedgerKey::ContractData(LedgerKeyContractData {
        contract: ScAddress::from(contract),
        key,
        durability: ContractDataDurability::Persistent,
    })
}

#[test]
fn scval_vectors() {
    use lihim_common::PollKind;
    use soroban_sdk::xdr::ScVal;

    let env = Env::default();
    let sem = Address::from_str(&env, SEMAPHORE_STRKEY);
    let polls = Address::from_str(&env, POLLS_STRKEY);
    let verifier = Address::from_str(&env, VERIFIER_STRKEY);
    let u = |n: u32| U256::from_u32(&env, n);

    // Contract-side enum variants encode exactly as `Vec[Symbol(name), ..]`.
    // Polls' and the verifier's `DataKey`s are private to their crates; their
    // own tests assert the same tuple encoding, so the tuple form is used here.
    assert_eq!(
        scval(&env, DataKey::Group(1).into_val(&env)),
        scval(&env, (Symbol::new(&env, "Group"), 1u64).into_val(&env))
    );
    assert_eq!(
        scval(
            &env,
            DataKey::Nullifier(polls.clone(), 1, u(77)).into_val(&env)
        ),
        scval(
            &env,
            (Symbol::new(&env, "Nullifier"), polls.clone(), 1u64, u(77)).into_val(&env)
        )
    );

    let proof = Proof {
        depth: 4,
        root: u(1001),
        nullifier: u(77),
        message: u(1),
        scope: u(42),
        points: Vec::from_array(&env, core::array::from_fn::<_, 8, _>(|i| u(i as u32 + 1))),
    };

    let values: StdVec<(&str, Val)> = std::vec![
        ("proof", proof.into_val(&env)),
        ("poll_kind_single_3", PollKind::Single(3).into_val(&env)),
        ("poll_kind_rating", PollKind::Rating.into_val(&env)),
        ("poll_kind_yesno", PollKind::YesNo.into_val(&env)),
    ];

    let keys: StdVec<(&str, &Address, Val)> = std::vec![
        ("semaphore Group(1)", &sem, DataKey::Group(1).into_val(&env)),
        ("semaphore Tree(1)", &sem, DataKey::Tree(1).into_val(&env)),
        (
            "semaphore RootTtl(1)",
            &sem,
            DataKey::RootTtl(1).into_val(&env)
        ),
        ("semaphore Nonce(1)", &sem, DataKey::Nonce(1).into_val(&env)),
        (
            "semaphore Leaf(1, 42)",
            &sem,
            DataKey::Leaf(1, u(42)).into_val(&env)
        ),
        (
            "semaphore Root(1, 1001)",
            &sem,
            DataKey::Root(1, u(1001)).into_val(&env)
        ),
        (
            "semaphore Nullifier(polls, 1, 77)",
            &sem,
            DataKey::Nullifier(polls.clone(), 1, u(77)).into_val(&env),
        ),
        (
            "polls Poll(42)",
            &polls,
            (Symbol::new(&env, "Poll"), 42u64).into_val(&env)
        ),
        (
            "polls Tally(42)",
            &polls,
            (Symbol::new(&env, "Tally"), 42u64).into_val(&env)
        ),
        (
            "polls Voters(42)",
            &polls,
            (Symbol::new(&env, "Voters"), 42u64).into_val(&env)
        ),
        (
            "polls Nonce(1)",
            &polls,
            (Symbol::new(&env, "Nonce"), 1u64).into_val(&env)
        ),
        (
            "verifier Vk(4)",
            &verifier,
            (Symbol::new(&env, "Vk"), 4u32).into_val(&env)
        ),
    ];

    let strkey = |a: &Address| -> &str {
        [SEMAPHORE_STRKEY, POLLS_STRKEY, VERIFIER_STRKEY]
            .into_iter()
            .find(|s| Address::from_str(&env, s) == *a)
            .unwrap()
    };
    let mut out_values = StdVec::new();
    for (name, v) in values {
        out_values.push(serde_json::json!({
            "name": name,
            "scval_xdr_hex": xdr_hex(&scval(&env, v)),
        }));
    }
    let mut out_keys = StdVec::new();
    for (name, contract, k) in keys {
        let key = scval(&env, k);
        out_keys.push(serde_json::json!({
            "name": name,
            "contract": strkey(contract),
            "key_scval_xdr_hex": xdr_hex(&key),
            "ledger_key_xdr_hex": xdr_hex(&persistent_key(contract, key)),
        }));
    }
    // The instance entry (config, counters, contract code ref) of a contract.
    out_keys.push(serde_json::json!({
        "name": "semaphore instance",
        "contract": SEMAPHORE_STRKEY,
        "key_scval_xdr_hex": xdr_hex(&ScVal::LedgerKeyContractInstance),
        "ledger_key_xdr_hex": xdr_hex(&persistent_key(&sem, ScVal::LedgerKeyContractInstance)),
    }));

    let json = serde_json::to_string_pretty(&serde_json::json!({
        "values": out_values,
        "ledger_keys": out_keys,
    }))
    .unwrap()
        + "\n";
    let path = std::format!("{}/../test-vectors/scval.json", env!("CARGO_MANIFEST_DIR"));
    if std::env::var("LIHIM_WRITE_VECTORS").is_ok() {
        std::fs::write(&path, &json).unwrap();
    } else {
        let on_disk = std::fs::read_to_string(&path).expect("missing scval.json; regenerate");
        assert_eq!(on_disk, json, "scval.json is stale; regenerate");
    }
}

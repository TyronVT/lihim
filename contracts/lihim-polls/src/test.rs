extern crate std;

use super::*;
use ed25519_dalek::SigningKey;
use lihim_common::testutils::{admin_key, public_key, sign};
use lihim_semaphore::{LihimSemaphore, LihimSemaphoreClient};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Events as _, Ledger as _},
    Address, Env, Symbol,
};

const NOW: u64 = 1_000_000;
const MIN_MEMBERS: u32 = 8;
const FIRST_POLL_ID: u64 = 1;

// Mock verifier: a configurable bool. The real Groth16 path is covered by
// lihim-verifier's tests and the M0 vectors.
#[contracttype]
enum MockKey {
    Result,
}

#[contract]
pub struct MockVerifier;

#[contractimpl]
impl MockVerifier {
    pub fn set_result(env: Env, ok: bool) {
        env.storage().instance().set(&MockKey::Result, &ok);
    }

    pub fn verify(env: Env, _depth: u32, _points: Vec<U256>, _signals: Vec<U256>) -> bool {
        env.storage()
            .instance()
            .get(&MockKey::Result)
            .unwrap_or(true)
    }
}

struct Fx {
    env: Env,
    polls: LihimPollsClient<'static>,
    sem: LihimSemaphoreClient<'static>,
    mock: MockVerifierClient<'static>,
    key: SigningKey,
}

impl Fx {
    fn new() -> Self {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        env.ledger().set_timestamp(NOW);
        let mock_id = env.register(MockVerifier, ());
        let sem_id = env.register(LihimSemaphore, (mock_id.clone(),));
        let polls_id = env.register(LihimPolls, (sem_id.clone(), MIN_MEMBERS, FIRST_POLL_ID));
        Fx {
            polls: LihimPollsClient::new(&env, &polls_id),
            sem: LihimSemaphoreClient::new(&env, &sem_id),
            mock: MockVerifierClient::new(&env, &mock_id),
            key: admin_key(3),
            env,
        }
    }

    fn u(&self, n: u64) -> U256 {
        U256::from_u128(&self.env, n as u128)
    }

    /// A group with `n` members on the real semaphore contract.
    fn group(&self, n: u32) -> u64 {
        let env = &self.env;
        let id = self.sem.next_group_id();
        let admin = public_key(env, &self.key);
        let sig = sign(
            env,
            &self.key,
            &self.sem.address,
            "create_group",
            id,
            0,
            (admin.clone(),),
        );
        self.sem.create_group(&admin, &sig);
        if n > 0 {
            let mut cs = Vec::new(env);
            for i in 0..n {
                cs.push_back(self.u(10_000 + i as u64));
            }
            let sig = sign(
                env,
                &self.key,
                &self.sem.address,
                "add_members",
                id,
                1,
                (cs.clone(),),
            );
            self.sem.add_members(&id, &cs, &sig);
        }
        id
    }

    fn add_member(&self, group_id: u64, c: u64) {
        let nonce = self.sem.nonce(&group_id);
        let c = self.u(c);
        let sig = sign(
            &self.env,
            &self.key,
            &self.sem.address,
            "add_member",
            group_id,
            nonce,
            (c.clone(),),
        );
        self.sem.add_member(&group_id, &c, &sig);
    }

    fn meta(&self) -> BytesN<32> {
        BytesN::from_array(&self.env, &[9u8; 32])
    }

    fn create_sig(&self, group_id: u64, nonce: u64, kind: &PollKind, closes_at: u64) -> BytesN<64> {
        sign(
            &self.env,
            &self.key,
            &self.polls.address,
            "create_poll",
            group_id,
            nonce,
            (kind.clone(), closes_at, self.meta()),
        )
    }

    fn create(&self, group_id: u64, kind: PollKind) -> u64 {
        let closes_at = NOW + 86_400;
        let sig = self.create_sig(group_id, self.polls.nonce(&group_id), &kind, closes_at);
        self.polls
            .create_poll(&group_id, &kind, &closes_at, &self.meta(), &sig)
    }

    fn proof(&self, poll_id: u64, nullifier: u64, choice: u64) -> Proof {
        let poll = self.polls.poll(&poll_id);
        Proof {
            depth: 3,
            root: poll.frozen_root,
            nullifier: self.u(nullifier),
            message: self.u(choice),
            scope: self.u(poll_id),
            points: Vec::from_array(
                &self.env,
                core::array::from_fn::<_, 8, _>(|i| self.u(i as u64 + 1)),
            ),
        }
    }
}

#[test]
fn create_poll_freezes_root_and_size() {
    let fx = Fx::new();
    let g = fx.group(8);
    let id = fx.create(g, PollKind::Single(3));
    // events().all() covers only the latest invocation; capture it first.
    let events = fx.env.events().all().filter_by_contract(&fx.polls.address);
    let group = fx.sem.group(&g);
    assert_eq!(
        events,
        soroban_sdk::vec![
            &fx.env,
            (
                fx.polls.address.clone(),
                (Symbol::new(&fx.env, "poll_created"), id).into_val(&fx.env),
                Vec::<Val>::from_array(
                    &fx.env,
                    [
                        g.into_val(&fx.env),
                        0u32.into_val(&fx.env),
                        3u32.into_val(&fx.env),
                        group.root.clone().into_val(&fx.env),
                        8u32.into_val(&fx.env),
                        (NOW + 86_400).into_val(&fx.env),
                        fx.meta().into_val(&fx.env),
                    ]
                )
                .into_val(&fx.env),
            )
        ]
    );
    assert_eq!(id, FIRST_POLL_ID);
    let poll = fx.polls.poll(&id);
    assert_eq!(poll.frozen_root, group.root);
    assert_eq!(poll.frozen_size, 8);
    assert_eq!(poll.creator_key, public_key(&fx.env, &fx.key));
    assert_eq!(poll.opens_at, NOW);
    assert!(!poll.closed);
    assert_eq!(fx.polls.tally(&id), soroban_sdk::vec![&fx.env, 0u32, 0, 0]);
    assert_eq!(fx.polls.voters_count(&id), 0);
    assert_eq!(fx.polls.nonce(&g), 1);
    assert_eq!(fx.create(g, PollKind::YesNo), FIRST_POLL_ID + 1);
}

#[test]
fn poll_below_min_members_rejected() {
    let fx = Fx::new();
    let g = fx.group(7);
    let kind = PollKind::YesNo;
    let closes = NOW + 100;
    let sig = fx.create_sig(g, 0, &kind, closes);
    assert_eq!(
        fx.polls
            .try_create_poll(&g, &kind, &closes, &fx.meta(), &sig),
        Err(Ok(Error::TooFewMembers))
    );
    // The failed call rolled back the nonce bump.
    assert_eq!(fx.polls.nonce(&g), 0);
}

#[test]
fn create_poll_signature_and_replay() {
    let fx = Fx::new();
    let g = fx.group(8);
    let kind = PollKind::Rating;
    let closes = NOW + 100;
    // Wrong signer.
    let other = admin_key(4);
    let bad = sign(
        &fx.env,
        &other,
        &fx.polls.address,
        "create_poll",
        g,
        0,
        (kind.clone(), closes, fx.meta()),
    );
    assert!(fx
        .polls
        .try_create_poll(&g, &kind, &closes, &fx.meta(), &bad)
        .is_err());
    // A signature meant for the semaphore contract does not work here.
    let wrong_contract = sign(
        &fx.env,
        &fx.key,
        &fx.sem.address,
        "create_poll",
        g,
        0,
        (kind.clone(), closes, fx.meta()),
    );
    assert!(fx
        .polls
        .try_create_poll(&g, &kind, &closes, &fx.meta(), &wrong_contract)
        .is_err());
    // Good once, then replay fails.
    let sig = fx.create_sig(g, 0, &kind, closes);
    fx.polls.create_poll(&g, &kind, &closes, &fx.meta(), &sig);
    assert!(fx
        .polls
        .try_create_poll(&g, &kind, &closes, &fx.meta(), &sig)
        .is_err());
}

#[test]
fn create_poll_validates_kind_and_close_time() {
    let fx = Fx::new();
    let g = fx.group(8);
    for kind in [PollKind::Single(1), PollKind::Single(MAX_OPTIONS + 1)] {
        let sig = fx.create_sig(g, 0, &kind, NOW + 10);
        assert_eq!(
            fx.polls
                .try_create_poll(&g, &kind, &(NOW + 10), &fx.meta(), &sig),
            Err(Ok(Error::InvalidKind))
        );
    }
    let sig = fx.create_sig(g, 0, &PollKind::YesNo, NOW);
    assert_eq!(
        fx.polls
            .try_create_poll(&g, &PollKind::YesNo, &NOW, &fx.meta(), &sig),
        Err(Ok(Error::InvalidCloseTime))
    );
}

#[test]
fn vote_happy_path() {
    let fx = Fx::new();
    let g = fx.group(8);
    let id = fx.create(g, PollKind::Single(3));
    let p = fx.proof(id, 555, 2);
    fx.polls.vote(&id, &p);
    assert_eq!(
        fx.env.events().all().filter_by_contract(&fx.polls.address),
        soroban_sdk::vec![
            &fx.env,
            (
                fx.polls.address.clone(),
                (Symbol::new(&fx.env, "voted"), id).into_val(&fx.env),
                Vec::<Val>::from_array(
                    &fx.env,
                    [fx.u(555).into_val(&fx.env), 2u32.into_val(&fx.env)]
                )
                .into_val(&fx.env),
            )
        ]
    );
    assert_eq!(fx.polls.tally(&id), soroban_sdk::vec![&fx.env, 0u32, 0, 1]);
    assert_eq!(fx.polls.voters_count(&id), 1);
    assert!(fx.sem.has_nullifier(&fx.polls.address, &g, &fx.u(555)));

    fx.polls.vote(&id, &fx.proof(id, 556, 0));
    assert_eq!(fx.polls.tally(&id), soroban_sdk::vec![&fx.env, 1u32, 0, 1]);
    assert_eq!(fx.polls.voters_count(&id), 2);
}

#[test]
fn rating_buckets_are_rating_minus_one() {
    let fx = Fx::new();
    let g = fx.group(8);
    let id = fx.create(g, PollKind::Rating);
    fx.polls.vote(&id, &fx.proof(id, 1, 5));
    fx.polls.vote(&id, &fx.proof(id, 2, 1));
    assert_eq!(
        fx.polls.tally(&id),
        soroban_sdk::vec![&fx.env, 1u32, 0, 0, 0, 1]
    );
}

#[test]
fn wrong_scope_rejected() {
    let fx = Fx::new();
    let g = fx.group(8);
    let a = fx.create(g, PollKind::YesNo);
    let b = fx.create(g, PollKind::YesNo);
    // A proof made for poll b replayed into poll a.
    let mut p = fx.proof(a, 9, 0);
    p.scope = fx.u(b);
    assert_eq!(fx.polls.try_vote(&a, &p), Err(Ok(Error::WrongScope)));
    assert_eq!(fx.polls.voters_count(&a), 0);
}

#[test]
fn frozen_root_survives_membership_changes() {
    let fx = Fx::new();
    let g = fx.group(8);
    let id = fx.create(g, PollKind::YesNo);
    let frozen = fx.polls.poll(&id).frozen_root;
    // Someone joins mid-poll, and the old root ages past root_ttl.
    fx.add_member(g, 99_999);
    fx.env.ledger().set_timestamp(NOW + 7_200);
    let current = fx.sem.root(&g);
    assert_ne!(current, frozen);
    // Proof against the current (post-join) root is not this poll's root.
    let mut p = fx.proof(id, 1, 0);
    p.root = current;
    assert_eq!(fx.polls.try_vote(&id, &p), Err(Ok(Error::WrongRoot)));
    // Proof against the frozen root still counts.
    fx.polls.vote(&id, &fx.proof(id, 1, 0));
    assert_eq!(fx.polls.voters_count(&id), 1);
}

#[test]
fn double_vote_rejected_as_already_voted() {
    let fx = Fx::new();
    let g = fx.group(8);
    let id = fx.create(g, PollKind::YesNo);
    fx.polls.vote(&id, &fx.proof(id, 42, 0));
    assert_eq!(
        fx.polls.try_vote(&id, &fx.proof(id, 42, 1)),
        Err(Ok(Error::AlreadyVoted))
    );
    assert_eq!(fx.polls.tally(&id), soroban_sdk::vec![&fx.env, 1u32, 0]);
}

#[test]
fn front_run_against_semaphore_does_not_block_vote() {
    let fx = Fx::new();
    let g = fx.group(8);
    let id = fx.create(g, PollKind::YesNo);
    let p = fx.proof(id, 42, 1);
    // Someone who saw the proof in flight submits it straight to the
    // semaphore first, from their own account.
    let attacker = Address::generate(&fx.env);
    fx.env.mock_all_auths();
    fx.sem.validate_frozen_proof(&attacker, &g, &p);
    assert!(fx.sem.has_nullifier(&attacker, &g, &fx.u(42)));
    // They cannot spend it in the polls contract's namespace: only the polls
    // contract can authorize its own address.
    fx.env.set_auths(&[]);
    assert!(fx
        .sem
        .try_validate_frozen_proof(&fx.polls.address, &g, &p)
        .is_err());
    // So the real vote still counts...
    fx.polls.vote(&id, &p);
    assert_eq!(fx.polls.tally(&id), soroban_sdk::vec![&fx.env, 0u32, 1]);
    // ...and a re-vote is still rejected.
    assert_eq!(fx.polls.try_vote(&id, &p), Err(Ok(Error::AlreadyVoted)));
}

#[test]
fn choice_out_of_range_rejected() {
    let fx = Fx::new();
    let g = fx.group(8);
    let single = fx.create(g, PollKind::Single(3));
    let rating = fx.create(g, PollKind::Rating);
    let yesno = fx.create(g, PollKind::YesNo);
    for (poll, choice) in [(single, 3u64), (rating, 0), (rating, 6), (yesno, 2)] {
        assert_eq!(
            fx.polls.try_vote(&poll, &fx.proof(poll, 7, choice)),
            Err(Ok(Error::ChoiceOutOfRange)),
            "poll={poll} choice={choice}"
        );
    }
    let mut p = fx.proof(yesno, 7, 0);
    p.message = U256::from_u128(&fx.env, u128::MAX).shl(8);
    assert_eq!(
        fx.polls.try_vote(&yesno, &p),
        Err(Ok(Error::ChoiceOutOfRange))
    );
}

#[test]
fn invalid_proof_rejected_and_nothing_recorded() {
    let fx = Fx::new();
    let g = fx.group(8);
    let id = fx.create(g, PollKind::YesNo);
    fx.mock.set_result(&false);
    // The semaphore's error code surfaces unchanged through `vote`
    // (114 InvalidProof), so clients can map codes from either contract.
    assert_eq!(
        fx.polls.try_vote(&id, &fx.proof(id, 5, 0)),
        Err(Err(soroban_sdk::InvokeError::Contract(114)))
    );
    assert_eq!(fx.polls.voters_count(&id), 0);
    assert!(!fx.sem.has_nullifier(&fx.polls.address, &g, &fx.u(5)));
}

#[test]
fn close_lifecycle() {
    let fx = Fx::new();
    let g = fx.group(8);
    let id = fx.create(g, PollKind::YesNo);
    assert_eq!(fx.polls.try_close(&id), Err(Ok(Error::NotYetClosable)));
    fx.env.ledger().set_timestamp(NOW + 86_400);
    // Voting ends at closes_at even before anyone calls close().
    assert_eq!(
        fx.polls.try_vote(&id, &fx.proof(id, 1, 0)),
        Err(Ok(Error::PollClosed))
    );
    fx.polls.close(&id);
    assert_eq!(
        fx.env.events().all(),
        soroban_sdk::vec![
            &fx.env,
            (
                fx.polls.address.clone(),
                (Symbol::new(&fx.env, "poll_closed"), id).into_val(&fx.env),
                ().into_val(&fx.env),
            )
        ]
    );
    assert!(fx.polls.poll(&id).closed);
    assert_eq!(fx.polls.try_close(&id), Err(Ok(Error::AlreadyClosed)));
    assert_eq!(fx.polls.try_poll(&999), Err(Ok(Error::PollNotFound)));
    fx.polls.bump_poll(&id);
}

// ---------------------------------------------------------------------------
// End to end with no mocks: real LihimVerifier with the official V4 keys,
// real LihimSemaphore holding the 10 M0 identities, and a real
// @semaphore-protocol/proof proof (scope 42, message 1 = "No").
// ---------------------------------------------------------------------------

use lihim_common::testutils::{bytes_hex, u256_dec};
use lihim_common::VerificationKey;
use lihim_verifier::{LihimVerifier, LihimVerifierClient};

fn vectors(name: &str) -> serde_json::Value {
    let path = std::format!("{}/../test-vectors/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn s(v: &serde_json::Value) -> &str {
    v.as_str().unwrap()
}

fn proof_from_json(env: &Env, v: &serde_json::Value) -> Proof {
    let mut points = Vec::new(env);
    for p in v["points"].as_array().unwrap() {
        points.push_back(u256_dec(env, s(p)));
    }
    Proof {
        depth: v["depth"].as_u64().unwrap() as u32,
        root: u256_dec(env, s(&v["root"])),
        nullifier: u256_dec(env, s(&v["nullifier"])),
        message: u256_dec(env, s(&v["message"])),
        scope: u256_dec(env, s(&v["scope"])),
        points,
    }
}

fn vk_from_json(env: &Env, v: &serde_json::Value) -> VerificationKey {
    let mut ic = Vec::new(env);
    for p in v["ic"].as_array().unwrap() {
        ic.push_back(bytes_hex::<64>(env, s(p)));
    }
    VerificationKey {
        alpha1: bytes_hex::<64>(env, s(&v["alpha1"])),
        beta2: bytes_hex::<128>(env, s(&v["beta2"])),
        gamma2: bytes_hex::<128>(env, s(&v["gamma2"])),
        delta2: bytes_hex::<128>(env, s(&v["delta2"])),
        ic,
    }
}

#[test]
fn end_to_end_real_semaphore_v4_proof() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    env.ledger().set_timestamp(NOW);

    let deployer = <soroban_sdk::Address as soroban_sdk::testutils::Address>::generate(&env);
    let verifier_id = env.register(LihimVerifier, (deployer,));
    let verifier = LihimVerifierClient::new(&env, &verifier_id);
    let g16 = vectors("groth16.json");
    env.mock_all_auths();
    for case in g16.as_array().unwrap() {
        verifier.set_vk(
            &(case["depth"].as_u64().unwrap() as u32),
            &vk_from_json(&env, &case["vk"]),
        );
    }
    env.set_auths(&[]);

    let sem_id = env.register(LihimSemaphore, (verifier_id,));
    let sem = LihimSemaphoreClient::new(&env, &sem_id);
    // The vectors use scope 42, so start poll ids there.
    let polls_id = env.register(LihimPolls, (sem_id.clone(), MIN_MEMBERS, 42u64));
    let polls = LihimPollsClient::new(&env, &polls_id);
    let key = admin_key(3);
    let admin = public_key(&env, &key);

    let g = sem.next_group_id();
    sem.create_group(
        &admin,
        &sign(&env, &key, &sem_id, "create_group", g, 0, (admin.clone(),)),
    );
    let mut cs = Vec::new(&env);
    for step in vectors("leanimt.json")["inserts"].as_array().unwrap() {
        cs.push_back(u256_dec(&env, s(&step["commitment"])));
    }
    sem.add_members(
        &g,
        &cs,
        &sign(&env, &key, &sem_id, "add_members", g, 1, (cs.clone(),)),
    );

    let kind = PollKind::YesNo;
    let closes = NOW + 3_600;
    let meta = BytesN::from_array(&env, &[1u8; 32]);
    let sig = sign(
        &env,
        &key,
        &polls_id,
        "create_poll",
        g,
        0,
        (kind.clone(), closes, meta.clone()),
    );
    let poll_id = polls.create_poll(&g, &kind, &closes, &meta, &sig);
    assert_eq!(poll_id, 42);

    let cases = g16.as_array().unwrap();
    let p4 = proof_from_json(&env, &cases[0]["proof"]);
    let p10 = proof_from_json(&env, &cases[1]["proof"]);
    assert_eq!(
        polls.poll(&poll_id).frozen_root,
        p4.root,
        "on-chain root == JS group root"
    );

    // Front-run: someone replays the real proof straight into the
    // semaphore under their own address before the relay's vote lands.
    // That spends the nullifier only in their namespace.
    let attacker = <soroban_sdk::Address as soroban_sdk::testutils::Address>::generate(&env);
    env.mock_all_auths();
    sem.validate_frozen_proof(&attacker, &g, &p4);
    env.set_auths(&[]);
    assert!(sem.has_nullifier(&attacker, &g, &p4.nullifier));
    assert!(!sem.has_nullifier(&polls_id, &g, &p4.nullifier));

    // Simulation-style check first (what the relay does), then the vote.
    assert!(sem.verify_proof(&polls_id, &g, &p4));
    env.cost_estimate().budget().reset_unlimited();
    polls.vote(&poll_id, &p4);
    std::println!(
        "vote (real proof, depth 4): cpu={} mem={}",
        env.cost_estimate().budget().cpu_instruction_cost(),
        env.cost_estimate().budget().memory_bytes_cost()
    );
    assert_eq!(polls.tally(&poll_id), soroban_sdk::vec![&env, 0u32, 1]);

    // Same identity, same scope, deeper circuit: same nullifier.
    assert_eq!(p10.nullifier, p4.nullifier);
    assert_eq!(polls.try_vote(&poll_id, &p10), Err(Ok(Error::AlreadyVoted)));

    // A real proof tampered in one coordinate does not count.
    let mut bad = p10.clone();
    bad.nullifier = bad.nullifier.add(&U256::from_u32(&env, 1));
    assert!(polls.try_vote(&poll_id, &bad).is_err());
    assert_eq!(polls.voters_count(&poll_id), 1);
}

/// Same flow, but with the built wasm (VM costs included), to size
/// MAX_BATCH and vote cost. Run after `stellar contract build`:
/// cargo test -p lihim-polls measure_costs_wasm -- --ignored --nocapture
#[test]
#[ignore = "needs target/wasm32v1-none/release/*.wasm; prints numbers"]
fn measure_costs_wasm() {
    let wasm = |name: &str| {
        std::fs::read(std::format!(
            "{}/../target/wasm32v1-none/release/{name}.wasm",
            env!("CARGO_MANIFEST_DIR")
        ))
        .expect("run `stellar contract build` first")
    };
    let env = Env::default();
    env.ledger().set_timestamp(NOW);
    let deployer = <soroban_sdk::Address as soroban_sdk::testutils::Address>::generate(&env);
    let verifier_id = env.register(wasm("lihim_verifier").as_slice(), (deployer,));
    let g16 = vectors("groth16.json");
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();
    for case in g16.as_array().unwrap() {
        LihimVerifierClient::new(&env, &verifier_id).set_vk(
            &(case["depth"].as_u64().unwrap() as u32),
            &vk_from_json(&env, &case["vk"]),
        );
    }
    env.set_auths(&[]);
    let sem_id = env.register(wasm("lihim_semaphore").as_slice(), (verifier_id,));
    let sem = LihimSemaphoreClient::new(&env, &sem_id);
    let polls_id = env.register(
        wasm("lihim_polls").as_slice(),
        (sem_id.clone(), MIN_MEMBERS, 42u64),
    );
    let polls = LihimPollsClient::new(&env, &polls_id);
    let key = admin_key(3);
    let admin = public_key(&env, &key);
    let report = |label: &str| {
        let b = env.cost_estimate().budget();
        std::println!(
            "{label}: cpu={} mem={}",
            b.cpu_instruction_cost(),
            b.memory_bytes_cost()
        );
    };

    let g = sem.next_group_id();
    sem.create_group(
        &admin,
        &sign(&env, &key, &sem_id, "create_group", g, 0, (admin.clone(),)),
    );
    let mut cs = Vec::new(&env);
    for step in vectors("leanimt.json")["inserts"].as_array().unwrap() {
        cs.push_back(u256_dec(&env, s(&step["commitment"])));
    }
    env.cost_estimate().budget().reset_unlimited();
    sem.add_members(
        &g,
        &cs,
        &sign(&env, &key, &sem_id, "add_members", g, 1, (cs.clone(),)),
    );
    report("add_members x10 (wasm)");

    // Grow to ~1000 leaves, then time single inserts and full batches.
    let mut nonce = 2;
    let mut next = 1_000_000u64;
    for _ in 0..31 {
        let mut b = Vec::new(&env);
        for _ in 0..32 {
            b.push_back(U256::from_u128(&env, next as u128));
            next += 1;
        }
        env.cost_estimate().budget().reset_unlimited();
        sem.add_members(
            &g,
            &b,
            &sign(&env, &key, &sem_id, "add_members", g, nonce, (b.clone(),)),
        );
        nonce += 1;
    }
    report("add_members x32 @~1000 leaves (wasm)");
    let c = U256::from_u128(&env, next as u128);
    env.cost_estimate().budget().reset_unlimited();
    sem.add_member(
        &g,
        &c,
        &sign(&env, &key, &sem_id, "add_member", g, nonce, (c.clone(),)),
    );
    report("add_member @1002 leaves, depth 10 (wasm)");

    let kind = PollKind::YesNo;
    let meta = BytesN::from_array(&env, &[1u8; 32]);
    let sig = sign(
        &env,
        &key,
        &polls_id,
        "create_poll",
        g,
        0,
        (kind.clone(), NOW + 3_600, meta.clone()),
    );
    env.cost_estimate().budget().reset_unlimited();
    polls.create_poll(&g, &kind, &(NOW + 3_600), &meta, &sig);
    report("create_poll (wasm)");
    // The vector proof is for the 10-member root; it is no longer the frozen
    // root here, so measure the verifier path through verify_proof on the
    // still-valid (within root_ttl) old root instead.
    let p4 = proof_from_json(&env, &g16.as_array().unwrap()[0]["proof"]);
    env.cost_estimate().budget().reset_unlimited();
    assert!(sem.verify_proof(&polls_id, &g, &p4));
    report("verify_proof real depth-4 proof (wasm)");
}

/// INTERFACE.md and test-vectors/scval.json describe these storage keys as
/// `Vec[Symbol(variant), ..fields]`; keepers build ledger keys from that.
#[test]
fn data_keys_encode_as_symbol_vec() {
    use soroban_sdk::{xdr::ScVal, TryFromVal};
    let env = Env::default();
    let sc = |v: Val| ScVal::try_from_val(&env, &v).unwrap();
    let cases = [
        (DataKey::Poll(42), "Poll", 42u64),
        (DataKey::Tally(42), "Tally", 42),
        (DataKey::Voters(42), "Voters", 42),
        (DataKey::Nonce(1), "Nonce", 1),
    ];
    for (key, name, id) in cases {
        assert_eq!(
            sc(key.into_val(&env)),
            sc((Symbol::new(&env, name), id).into_val(&env))
        );
    }
    assert_eq!(
        sc(DataKey::NextPollId.into_val(&env)),
        sc((Symbol::new(&env, "NextPollId"),).into_val(&env))
    );
}

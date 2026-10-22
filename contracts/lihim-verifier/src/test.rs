extern crate std;

use super::*;
use soroban_sdk::{bytesn, testutils::Address as _, vec, Address, Env};

// BN254 generators. G2 is written imaginary-first (EIP-197 / Soroban order).
const G1_X: u32 = 1;
const G1_Y: u32 = 2;

fn g2_gen(env: &Env) -> [U256; 4] {
    [
        u(
            env,
            bytesn!(
                env,
                0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2
            ),
        ),
        u(
            env,
            bytesn!(
                env,
                0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed
            ),
        ),
        u(
            env,
            bytesn!(
                env,
                0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b
            ),
        ),
        u(
            env,
            bytesn!(
                env,
                0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa
            ),
        ),
    ]
}

fn u(env: &Env, b: BytesN<32>) -> U256 {
    U256::from_be_bytes(env, &b.into())
}

fn g1_bytes(_env: &Env, x: &U256, y: &U256) -> BytesN<64> {
    let mut b = x.to_be_bytes();
    b.append(&y.to_be_bytes());
    b.try_into().unwrap()
}

fn g2_bytes(env: &Env) -> BytesN<128> {
    let mut b = Bytes::new(env);
    for c in g2_gen(env) {
        b.append(&c.to_be_bytes());
    }
    b.try_into().unwrap()
}

fn g1(env: &Env) -> BytesN<64> {
    g1_bytes(env, &U256::from_u32(env, G1_X), &U256::from_u32(env, G1_Y))
}

/// A key where alpha = IC[i] = G1 and beta = gamma = delta = G2. Not a real
/// circuit key, but it makes the Groth16 equation satisfiable by hand:
/// with A = G1, B = G2, C = -(1 + sum(s)) * G1 every factor cancels.
fn synthetic_vk(env: &Env) -> VerificationKey {
    VerificationKey {
        alpha1: g1(env),
        beta2: g2_bytes(env),
        gamma2: g2_bytes(env),
        delta2: g2_bytes(env),
        ic: vec![env, g1(env), g1(env), g1(env), g1(env), g1(env)],
    }
}

fn synthetic_proof(env: &Env, signals: &Vec<U256>) -> Vec<U256> {
    let bn = env.crypto().bn254();
    let mut k = Bn254Fr::from_u256(U256::from_u32(env, 1));
    for s in signals.iter() {
        k = k + Bn254Fr::from_u256(s);
    }
    let c = -bn.g1_mul(&Bn254G1Affine::from_bytes(g1(env)), &k);
    let c = Bytes::from(c.to_bytes());
    let g2 = g2_gen(env);
    vec![
        env,
        U256::from_u32(env, G1_X),
        U256::from_u32(env, G1_Y),
        g2[0].clone(),
        g2[1].clone(),
        g2[2].clone(),
        g2[3].clone(),
        U256::from_be_bytes(env, &c.slice(0..32)),
        U256::from_be_bytes(env, &c.slice(32..64)),
    ]
}

fn signals(env: &Env) -> Vec<U256> {
    vec![
        env,
        U256::from_u32(env, 11),
        U256::from_u32(env, 22),
        U256::from_u32(env, 33),
        U256::from_u32(env, 44),
    ]
}

fn setup(env: &Env) -> (LihimVerifierClient<'_>, Address) {
    let admin = Address::generate(env);
    let id = env.register(LihimVerifier, (admin.clone(),));
    (LihimVerifierClient::new(env, &id), admin)
}

#[test]
fn synthetic_proof_verifies() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    client.set_vk(&4, &synthetic_vk(&env));
    let s = signals(&env);
    assert!(client.verify(&4, &synthetic_proof(&env, &s), &s));
}

#[test]
fn tampered_signal_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    client.set_vk(&4, &synthetic_vk(&env));
    let s = signals(&env);
    let points = synthetic_proof(&env, &s);
    let mut bad = s.clone();
    bad.set(3, U256::from_u32(&env, 45));
    assert!(!client.verify(&4, &points, &bad));
}

#[test]
fn non_canonical_signal_rejected() {
    // s and s + r are the same scalar to the host; only the range check
    // stops the second encoding from verifying.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    client.set_vk(&4, &synthetic_vk(&env));
    let s = signals(&env);
    let points = synthetic_proof(&env, &s);
    let mut aliased = s.clone();
    aliased.set(0, s.get(0).unwrap().add(&fr_modulus(&env)));
    assert!(!client.verify(&4, &points, &aliased));
}

#[test]
fn out_of_range_coordinate_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    client.set_vk(&4, &synthetic_vk(&env));
    let s = signals(&env);
    let mut points = synthetic_proof(&env, &s);
    points.set(0, fp_modulus(&env));
    assert!(!client.verify(&4, &points, &s));
}

#[test]
fn off_curve_point_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    client.set_vk(&4, &synthetic_vk(&env));
    let s = signals(&env);
    let mut points = synthetic_proof(&env, &s);
    points.set(1, U256::from_u32(&env, 3)); // (1, 3) is not on y^2 = x^3 + 3
    assert!(!client.verify(&4, &points, &s));
}

#[test]
fn missing_vk_errors() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let s = signals(&env);
    let res = client.try_verify(&5, &synthetic_proof(&env, &s), &s);
    // verify() returns a bare bool, so the error surfaces as a generic
    // contract error carrying our code.
    assert_eq!(
        res,
        Err(Ok(soroban_sdk::Error::from_contract_error(
            Error::VkNotSet as u32
        )))
    );
}

#[test]
fn set_vk_requires_admin_auth() {
    let env = Env::default();
    let (client, _) = setup(&env);
    assert!(client.try_set_vk(&4, &synthetic_vk(&env)).is_err());
}

#[test]
fn finalize_requires_all_depths_then_locks() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    client.set_vk(&1, &synthetic_vk(&env));
    assert_eq!(client.try_finalize(), Err(Ok(Error::MissingVks)));
    for d in 2..=32 {
        client.set_vk(&d, &synthetic_vk(&env));
    }
    client.finalize();
    assert!(client.is_finalized());
    assert_eq!(client.admin(), None);
    assert_eq!(
        client.try_set_vk(&4, &synthetic_vk(&env)),
        Err(Ok(Error::Finalized))
    );
}

#[test]
fn malformed_vk_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    let mut vk = synthetic_vk(&env);
    vk.ic.pop_back();
    assert_eq!(client.try_set_vk(&4, &vk), Err(Ok(Error::MalformedVk)));
    let mut vk = synthetic_vk(&env);
    vk.alpha1 = g1_bytes(&env, &U256::from_u32(&env, 1), &U256::from_u32(&env, 3));
    assert_eq!(client.try_set_vk(&4, &vk), Err(Ok(Error::MalformedVk)));
    assert_eq!(
        client.try_set_vk(&33, &synthetic_vk(&env)),
        Err(Ok(Error::DepthNotSupported))
    );
}

// ---------------------------------------------------------------------------
// M0 acceptance 4 (native half): real @semaphore-protocol/proof proofs at
// depth 4 and 10 verify against the official V4 keys; tampered proof, wrong
// root and wrong scope fail. Vectors: test-vectors/groth16.json, generated by
// test-vectors/generate.mjs. The testnet half is still TODO(M0).
// ---------------------------------------------------------------------------

use lihim_common::testutils::{bytes_hex, u256_dec};

fn groth16_vectors() -> serde_json::Value {
    let path = std::format!(
        "{}/../test-vectors/groth16.json",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn dec_vec(env: &Env, v: &serde_json::Value) -> Vec<U256> {
    let mut out = Vec::new(env);
    for x in v.as_array().unwrap() {
        out.push_back(u256_dec(env, x.as_str().unwrap()));
    }
    out
}

pub fn vk_from_json(env: &Env, v: &serde_json::Value) -> VerificationKey {
    let mut ic = Vec::new(env);
    for p in v["ic"].as_array().unwrap() {
        ic.push_back(bytes_hex::<64>(env, p.as_str().unwrap()));
    }
    VerificationKey {
        alpha1: bytes_hex::<64>(env, v["alpha1"].as_str().unwrap()),
        beta2: bytes_hex::<128>(env, v["beta2"].as_str().unwrap()),
        gamma2: bytes_hex::<128>(env, v["gamma2"].as_str().unwrap()),
        delta2: bytes_hex::<128>(env, v["delta2"].as_str().unwrap()),
        ic,
    }
}

#[test]
fn m0_semaphore_v4_groth16_vectors() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();
    let (client, _) = setup(&env);
    let cases = groth16_vectors();
    for case in cases.as_array().unwrap() {
        let depth = case["depth"].as_u64().unwrap() as u32;
        client.set_vk(&depth, &vk_from_json(&env, &case["vk"]));
        let points = dec_vec(&env, &case["proof"]["points"]);
        let signals = dec_vec(&env, &case["signals"]);

        // Our keccak encoding agrees with what the circuit was fed.
        let msg = u256_dec(&env, case["proof"]["message"].as_str().unwrap());
        let scope = u256_dec(&env, case["proof"]["scope"].as_str().unwrap());
        assert_eq!(
            lihim_common::hash_to_field(&env, &msg),
            signals.get(2).unwrap()
        );
        assert_eq!(
            lihim_common::hash_to_field(&env, &scope),
            signals.get(3).unwrap()
        );

        env.cost_estimate().budget().reset_unlimited();
        assert!(
            client.verify(&depth, &points, &signals),
            "depth {depth} should verify"
        );
        std::println!(
            "verify depth {depth}: cpu={} mem={}",
            env.cost_estimate().budget().cpu_instruction_cost(),
            env.cost_estimate().budget().memory_bytes_cost()
        );

        // Wrong root.
        let mut bad = signals.clone();
        bad.set(0, bad.get(0).unwrap().add(&U256::from_u32(&env, 1)));
        assert!(!client.verify(&depth, &points, &bad));
        // Wrong scope.
        let mut bad = signals.clone();
        bad.set(
            3,
            lihim_common::hash_to_field(&env, &U256::from_u32(&env, 43)),
        );
        assert!(!client.verify(&depth, &points, &bad));
        // Tampered proof: C replaced by another valid curve point (2 * C is
        // on the curve, so this exercises the pairing, not the curve check).
        let bn = env.crypto().bn254();
        let c = Bn254G1Affine::from_bytes(concat(&env, &points, 6, 2).try_into().unwrap());
        let c2 = Bytes::from(bn.g1_add(&c, &c).to_bytes());
        let mut tampered = points.clone();
        tampered.set(6, U256::from_be_bytes(&env, &c2.slice(0..32)));
        tampered.set(7, U256::from_be_bytes(&env, &c2.slice(32..64)));
        assert!(!client.verify(&depth, &tampered, &signals));
        // Swapped G2 coordinate order (c0/c1) must not verify: the host
        // either rejects the point or the pairing fails.
        let mut swapped = points.clone();
        swapped.set(2, points.get(3).unwrap());
        swapped.set(3, points.get(2).unwrap());
        assert!(client.try_verify(&depth, &swapped, &signals) != Ok(Ok(true)));
        // Wrong depth's key.
        let other = if depth == 4 { 10 } else { 4 };
        if client.vk(&other).is_some() {
            assert!(!client.verify(&other, &points, &signals));
        }
    }
}

/// All 32 official keys (contracts/vks, from scripts/vk-to-soroban.mjs) pass
/// set_vk's checks, and the contract finalizes with them.
#[test]
fn official_vks_load_and_finalize() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();
    let (client, _) = setup(&env);
    for depth in 1..=32u32 {
        let path = std::format!("{}/../vks/{depth}.json", env!("CARGO_MANIFEST_DIR"));
        let v: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        client.set_vk(&depth, &vk_from_json(&env, &v));
    }
    client.finalize();
    assert!(client.is_finalized());
}

/// INTERFACE.md documents the key ledger key as `Vec[Symbol("Vk"), U32(depth)]`.
#[test]
fn vk_data_key_encodes_as_symbol_vec() {
    use soroban_sdk::{xdr::ScVal, IntoVal, Symbol, TryFromVal, Val};
    let env = Env::default();
    let sc = |v: Val| ScVal::try_from_val(&env, &v).unwrap();
    assert_eq!(
        sc(DataKey::Vk(4).into_val(&env)),
        sc((Symbol::new(&env, "Vk"), 4u32).into_val(&env))
    );
}

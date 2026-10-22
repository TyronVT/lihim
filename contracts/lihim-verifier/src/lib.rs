//! LihimVerifier: Groth16 over BN254 for the official Semaphore V4 circuits.
//!
//! Written directly against the soroban-sdk 28 BN254 host functions
//! (`g1_msm`, `pairing_check`, `g1_is_on_curve`) rather than ported, because
//! the verification equation is short and a direct implementation is easier
//! to review than an adapted third-party verifier. See README "Verifier
//! source" for the decision record.
//!
//! Lifecycle: the deployer (`admin`) loads one verification key per depth with
//! `set_vk`, then calls `finalize`, which requires all 32 keys and removes the
//! admin role for good. After that the keys are immutable.

#![no_std]

use lihim_common::{
    fp_modulus, fr_modulus, VerificationKey, BUMP_AMOUNT, BUMP_THRESHOLD, MAX_DEPTH, MIN_DEPTH,
    PROOF_POINTS, PUBLIC_SIGNALS,
};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    panic_with_error, Address, Bytes, BytesN, Env, Vec, U256,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Finalized = 300,
    DepthNotSupported = 301,
    VkNotSet = 302,
    MalformedVk = 303,
    MissingVks = 304,
    MalformedInput = 305,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Vk(u32),
}

#[contract]
pub struct LihimVerifier;

#[contractimpl]
impl LihimVerifier {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Store the verification key for `depth`. Admin only, before `finalize`.
    pub fn set_vk(env: Env, depth: u32, vk: VerificationKey) -> Result<(), Error> {
        let admin = Self::require_admin(&env)?;
        admin.require_auth();
        if !(MIN_DEPTH..=MAX_DEPTH).contains(&depth) {
            return Err(Error::DepthNotSupported);
        }
        if vk.ic.len() != PUBLIC_SIGNALS + 1 {
            return Err(Error::MalformedVk);
        }
        // Validate G1 points now so a bad key fails at load time rather than
        // turning every later proof into a trap. G2 points are checked by the
        // host (on-curve + subgroup) on first use; sdk 28 exposes no G2 check.
        let bn = env.crypto().bn254();
        let mut g1s = Vec::new(&env);
        g1s.push_back(vk.alpha1.clone());
        for p in vk.ic.iter() {
            g1s.push_back(p);
        }
        for p in g1s.iter() {
            if !coords_in_fp(&env, &Bytes::from(p.clone()))
                || !bn.g1_is_on_curve(&Bn254G1Affine::from_bytes(p))
            {
                return Err(Error::MalformedVk);
            }
        }
        for p in [&vk.beta2, &vk.gamma2, &vk.delta2] {
            if !coords_in_fp(&env, &Bytes::from(p.clone())) {
                return Err(Error::MalformedVk);
            }
        }
        let key = DataKey::Vk(depth);
        env.storage().persistent().set(&key, &vk);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
        bump_instance(&env);
        Ok(())
    }

    /// Remove the admin role forever. Requires all 32 keys to be loaded so the
    /// contract can never end up admin-less with a missing depth.
    pub fn finalize(env: Env) -> Result<(), Error> {
        let admin = Self::require_admin(&env)?;
        admin.require_auth();
        for depth in MIN_DEPTH..=MAX_DEPTH {
            if !env.storage().persistent().has(&DataKey::Vk(depth)) {
                return Err(Error::MissingVks);
            }
        }
        env.storage().instance().remove(&DataKey::Admin);
        bump_instance(&env);
        Ok(())
    }

    /// Groth16 check for a Semaphore V4 proof of tree depth `depth`.
    ///
    /// `points` = packed proof (see `lihim_common::Proof`), `signals` =
    /// `[root, nullifier, hash(message), hash(scope)]`.
    ///
    /// Returns `false` for any proof that does not verify, including
    /// out-of-range field elements and off-curve G1 points. An invalid G2
    /// point (`b`) traps inside the host pairing call, which also rejects.
    pub fn verify(env: Env, depth: u32, points: Vec<U256>, signals: Vec<U256>) -> bool {
        if !(MIN_DEPTH..=MAX_DEPTH).contains(&depth) {
            panic_with_error!(&env, Error::DepthNotSupported);
        }
        if points.len() != PROOF_POINTS || signals.len() != PUBLIC_SIGNALS {
            panic_with_error!(&env, Error::MalformedInput);
        }
        let vk: VerificationKey = env
            .storage()
            .persistent()
            .get(&DataKey::Vk(depth))
            .unwrap_or_else(|| panic_with_error!(&env, Error::VkNotSet));

        // Reject non-canonical encodings: coordinates must be < p and public
        // signals < r. The host reduces scalars mod r silently, so without
        // this check `x` and `x + r` would both verify.
        let p = fp_modulus(&env);
        if points.iter().any(|c| c >= p) {
            return false;
        }
        let r = fr_modulus(&env);
        if signals.iter().any(|s| s >= r) {
            return false;
        }

        let bn = env.crypto().bn254();
        let a = g1_from(&env, &points, 0);
        let c = g1_from(&env, &points, 6);
        if !bn.g1_is_on_curve(&a) || !bn.g1_is_on_curve(&c) {
            return false;
        }
        let b = g2_from(&env, &points, 2);

        // vk_x = IC[0] + sum(signals[i] * IC[i + 1])
        let mut ic_tail = Vec::new(&env);
        let mut scalars = Vec::new(&env);
        for i in 0..PUBLIC_SIGNALS {
            ic_tail.push_back(Bn254G1Affine::from_bytes(vk.ic.get_unchecked(i + 1)));
            scalars.push_back(Bn254Fr::from_u256(signals.get_unchecked(i)));
        }
        let vk_x = bn.g1_add(
            &Bn254G1Affine::from_bytes(vk.ic.get_unchecked(0)),
            &bn.g1_msm(ic_tail, scalars),
        );

        // e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
        let mut g1 = Vec::new(&env);
        g1.push_back(-a);
        g1.push_back(Bn254G1Affine::from_bytes(vk.alpha1));
        g1.push_back(vk_x);
        g1.push_back(c);
        let mut g2 = Vec::new(&env);
        g2.push_back(b);
        g2.push_back(Bn254G2Affine::from_bytes(vk.beta2));
        g2.push_back(Bn254G2Affine::from_bytes(vk.gamma2));
        g2.push_back(Bn254G2Affine::from_bytes(vk.delta2));
        bn.pairing_check(g1, g2)
    }

    pub fn vk(env: Env, depth: u32) -> Option<VerificationKey> {
        env.storage().persistent().get(&DataKey::Vk(depth))
    }

    pub fn admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }

    pub fn is_finalized(env: Env) -> bool {
        !env.storage().instance().has(&DataKey::Admin)
    }

    /// Keeper hook: extend TTL of the instance and every stored key. Anyone
    /// may call it; it only costs the caller fees.
    pub fn bump(env: Env) {
        bump_instance(&env);
        for depth in MIN_DEPTH..=MAX_DEPTH {
            let key = DataKey::Vk(depth);
            if env.storage().persistent().has(&key) {
                env.storage()
                    .persistent()
                    .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
            }
        }
    }
}

impl LihimVerifier {
    fn require_admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::Finalized)
    }
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
}

/// Every 32-byte big-endian chunk of an encoded point must be < p.
fn coords_in_fp(env: &Env, encoded: &Bytes) -> bool {
    let p = fp_modulus(env);
    let mut i = 0;
    while i < encoded.len() {
        if U256::from_be_bytes(env, &encoded.slice(i..i + 32)) >= p {
            return false;
        }
        i += 32;
    }
    true
}

fn concat(env: &Env, points: &Vec<U256>, start: u32, n: u32) -> Bytes {
    let mut out = Bytes::new(env);
    for i in start..start + n {
        out.append(&points.get_unchecked(i).to_be_bytes());
    }
    out
}

fn g1_from(env: &Env, points: &Vec<U256>, start: u32) -> Bn254G1Affine {
    let bytes: BytesN<64> = concat(env, points, start, 2).try_into().unwrap();
    Bn254G1Affine::from_bytes(bytes)
}

/// The packed proof already stores G2 imaginary-first (EIP-197 order), which
/// is exactly Soroban's `be(c1) || be(c0)` encoding, so no reordering here.
// Confirmed natively with real proofs (`m0_semaphore_v4_groth16_vectors`,
// which also checks the swapped order fails). TODO(M0): confirm on testnet.
fn g2_from(env: &Env, points: &Vec<U256>, start: u32) -> Bn254G2Affine {
    let bytes: BytesN<128> = concat(env, points, start, 4).try_into().unwrap();
    Bn254G2Affine::from_bytes(bytes)
}

#[cfg(test)]
mod test;

//! Types, cross-contract interfaces and helpers shared by the Lihim contracts.
//!
//! This is a plain library crate (not a contract) so that contracts can call
//! each other through `#[contractclient]` interfaces without linking another
//! contract's exported functions into their own wasm.

#![no_std]

use soroban_sdk::{
    contractclient, contracttype, xdr::ToXdr, Address, Bytes, BytesN, Env, IntoVal, Val, Vec, U256,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Semaphore V4 supports trees of depth 1..=32, one verification key each.
pub const MIN_DEPTH: u32 = 1;
pub const MAX_DEPTH: u32 = 32;

/// Number of field elements in a packed Groth16 proof.
pub const PROOF_POINTS: u32 = 8;

/// Public signals: [merkleTreeRoot, nullifier, hash(message), hash(scope)].
pub const PUBLIC_SIGNALS: u32 = 4;

/// BN254 scalar field modulus r (the SNARK field; leaves, roots, signals).
pub const FR_MODULUS_BE: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

/// BN254 base field modulus p (curve point coordinates).
pub const FP_MODULUS_BE: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

/// Ledgers per day at ~5s close time.
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// Persistent entries are extended to ~14 days whenever they drop below ~7
/// days. Groups can sit idle between polls for months, and an archived
/// nullifier entry must never be mistaken for an absent one, so we bump on
/// every write and the daily keeper bumps the rest.
///
/// Kept short because every write pays rent for the whole extension up front:
/// at 120 days, `create_group` alone needed ~478 XLM on testnet (2026-10-24),
/// above the per-transaction fee cap. TODO(M0): measure mainnet rent and pick
/// the production value; the keeper's KEEPER_EXTEND_TO_LEDGERS must match.
pub const BUMP_AMOUNT: u32 = 14 * DAY_IN_LEDGERS;
pub const BUMP_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;

// ---------------------------------------------------------------------------
// Shared contract types
// ---------------------------------------------------------------------------

/// A Semaphore V4 proof as submitted to `validate_proof` / `vote`.
///
/// `points` is the snarkjs proof packed the way `@zk-kit/utils`
/// `packGroth16Proof` does it:
/// `[a.x, a.y, b.x.c1, b.x.c0, b.y.c1, b.y.c0, c.x, c.y]`.
/// The G2 coordinates are imaginary-first, which is also the order the
/// Soroban BN254 host functions expect (`be(c1) || be(c0)`).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proof {
    pub depth: u32,
    pub root: U256,
    pub nullifier: U256,
    pub message: U256,
    pub scope: U256,
    /// Exactly 8 elements; `Vec` because contract types cannot be fixed arrays.
    pub points: Vec<U256>,
}

/// On-chain group state.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Group {
    /// Ed25519 public key that signs admin actions for this group.
    pub admin: BytesN<32>,
    /// LeanIMT size: number of leaf slots ever used (removed leaves stay as 0).
    pub size: u32,
    /// Active members (size minus removed leaves). This is the anonymity set
    /// that `min_members` is checked against.
    pub members: u32,
    /// LeanIMT depth (0 for a tree with 0 or 1 leaves).
    pub depth: u32,
    pub root: U256,
    /// Ledger timestamp at creation.
    pub created_at: u64,
}

/// Groth16 verification key with points in Soroban BN254 encoding:
/// G1 = `be(x) || be(y)`, G2 = `be(x.c1) || be(x.c0) || be(y.c1) || be(y.c0)`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationKey {
    pub alpha1: BytesN<64>,
    pub beta2: BytesN<128>,
    pub gamma2: BytesN<128>,
    pub delta2: BytesN<128>,
    /// `PUBLIC_SIGNALS + 1` points.
    pub ic: Vec<BytesN<64>>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PollKind {
    /// Pick one of `n` options (2..=MAX_OPTIONS). Message = option index, 0-based.
    Single(u32),
    /// Rating 1..=5. Message = the rating.
    Rating,
    /// Message 0 = Yes, 1 = No.
    YesNo,
}

impl PollKind {
    /// Tag used in the `poll_created` event: 0 single, 1 rating, 2 yesno.
    pub fn tag(&self) -> u32 {
        match self {
            PollKind::Single(_) => 0,
            PollKind::Rating => 1,
            PollKind::YesNo => 2,
        }
    }

    /// Number of tally buckets.
    pub fn n_options(&self) -> u32 {
        match self {
            PollKind::Single(n) => *n,
            PollKind::Rating => 5,
            PollKind::YesNo => 2,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Poll {
    pub group_id: u64,
    /// Group admin key at poll creation.
    // TODO: delegated poll-creator keys (spec allows them; MVP is admin only).
    pub creator_key: BytesN<32>,
    pub kind: PollKind,
    /// Group root when the poll opened; only these members can vote.
    pub frozen_root: U256,
    /// Active members when the poll opened (>= min_members).
    pub frozen_size: u32,
    pub opens_at: u64,
    pub closes_at: u64,
    /// sha256 of the off-chain title/options JSON.
    pub meta_hash: BytesN<32>,
    pub closed: bool,
}

// ---------------------------------------------------------------------------
// Cross-contract interfaces
// ---------------------------------------------------------------------------

#[contractclient(name = "VerifierClient")]
pub trait VerifierInterface {
    fn verify(env: Env, depth: u32, points: Vec<U256>, signals: Vec<U256>) -> bool;
}

/// The subset of LihimSemaphore that LihimPolls calls.
///
/// Nullifiers are namespaced by the calling app (`caller`): an app passes
/// its own address (`env.current_contract_address()`), and the semaphore
/// does `caller.require_auth()`, which a contract satisfies automatically
/// when it is the direct invoker. Nobody else can spend a nullifier in that
/// app's namespace, so a proof seen in flight cannot be front-run into it.
#[contractclient(name = "SemaphoreClient")]
pub trait SemaphoreInterface {
    fn group(env: Env, group_id: u64) -> Group;
    fn has_nullifier(env: Env, caller: Address, group_id: u64, nullifier: U256) -> bool;
    fn validate_frozen_proof(env: Env, caller: Address, group_id: u64, proof: Proof);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub fn fr_modulus(env: &Env) -> U256 {
    U256::from_be_bytes(env, &Bytes::from_array(env, &FR_MODULUS_BE))
}

pub fn fp_modulus(env: &Env) -> U256 {
    U256::from_be_bytes(env, &Bytes::from_array(env, &FP_MODULUS_BE))
}

/// `true` if `x` is a canonical BN254 scalar field element.
pub fn is_fr(env: &Env, x: &U256) -> bool {
    *x < fr_modulus(env)
}

/// Semaphore's `hash(x) = uint256(keccak256(abi.encodePacked(uint256 x))) >> 8`,
/// i.e. keccak over the 32-byte big-endian encoding, shifted to fit the field.
// Matches the JS library on test-vectors/keccak.json (semaphore test
// `m0_keccak_hash_10_vectors`) and on real proofs' public signals.
pub fn hash_to_field(env: &Env, x: &U256) -> U256 {
    let digest = env.crypto().keccak256(&x.to_be_bytes());
    U256::from_be_bytes(env, &digest.to_bytes().into()).shr(8)
}

/// The 32-byte digest an admin key signs:
///
/// `sha256( contract_strkey_ascii || fn_tag_ascii || be64(group_id) || be64(nonce) || args_xdr )`
///
/// where `args_xdr` is the XDR `ScVal` of a tuple (an `ScVal::Vec`) of the
/// function's remaining arguments in declaration order, excluding the group
/// id and the signature. Binding the contract address and fn tag stops a
/// signature for one contract/function being replayed against another; the
/// nonce stops replays of the same call.
pub fn admin_digest<A: IntoVal<Env, Val>>(
    env: &Env,
    contract: &Address,
    fn_tag: &str,
    group_id: u64,
    nonce: u64,
    args: A,
) -> BytesN<32> {
    let mut msg = contract.to_string().to_bytes();
    msg.append(&Bytes::from_slice(env, fn_tag.as_bytes()));
    msg.append(&Bytes::from_array(env, &group_id.to_be_bytes()));
    msg.append(&Bytes::from_array(env, &nonce.to_be_bytes()));
    let args: Val = args.into_val(env);
    msg.append(&args.to_xdr(env));
    env.crypto().sha256(&msg).to_bytes()
}

/// Verify an admin signature over [`admin_digest`]. Traps (host crypto error)
/// on a bad signature, which aborts the transaction.
pub fn require_admin_sig<A: IntoVal<Env, Val>>(
    env: &Env,
    admin: &BytesN<32>,
    sig: &BytesN<64>,
    fn_tag: &str,
    group_id: u64,
    nonce: u64,
    args: A,
) {
    let digest = admin_digest(
        env,
        &env.current_contract_address(),
        fn_tag,
        group_id,
        nonce,
        args,
    );
    env.crypto().ed25519_verify(admin, &digest.into(), sig);
}

#[cfg(feature = "testutils")]
pub mod testutils {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    /// Deterministic admin key for tests.
    pub fn admin_key(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }

    pub fn public_key(env: &Env, key: &SigningKey) -> BytesN<32> {
        BytesN::from_array(env, &key.verifying_key().to_bytes())
    }

    /// Sign the admin digest for a call to `contract`.
    pub fn sign<A: IntoVal<Env, Val>>(
        env: &Env,
        key: &SigningKey,
        contract: &Address,
        fn_tag: &str,
        group_id: u64,
        nonce: u64,
        args: A,
    ) -> BytesN<64> {
        let digest = admin_digest(env, contract, fn_tag, group_id, nonce, args);
        BytesN::from_array(env, &key.sign(&digest.to_array()).to_bytes())
    }

    /// Parse a base-10 string (the wire format for bigints) into a U256.
    pub fn u256_dec(env: &Env, s: &str) -> U256 {
        let mut be = [0u8; 32];
        for ch in s.bytes() {
            assert!(ch.is_ascii_digit(), "not a decimal digit");
            let mut carry = (ch - b'0') as u32;
            for byte in be.iter_mut().rev() {
                let v = (*byte as u32) * 10 + carry;
                *byte = v as u8;
                carry = v >> 8;
            }
            assert_eq!(carry, 0, "overflows 256 bits");
        }
        U256::from_be_bytes(env, &Bytes::from_array(env, &be))
    }

    /// Parse unprefixed hex into BytesN<N>.
    pub fn bytes_hex<const N: usize>(env: &Env, hex: &str) -> BytesN<N> {
        assert_eq!(hex.len(), N * 2, "wrong hex length");
        let mut out = [0u8; N];
        for (i, b) in out.iter_mut().enumerate() {
            let pair = &hex[i * 2..i * 2 + 2];
            *b = u8::from_str_radix(pair, 16).expect("bad hex");
        }
        BytesN::from_array(env, &out)
    }
}

//! LihimPolls: anonymous polls on top of LihimSemaphore.
//!
//! - Scope = poll id, so each member votes once per poll and votes across
//!   polls are unlinkable.
//! - The group root is frozen at poll open: only members present then can
//!   vote, and later membership changes never break an open poll. Votes go
//!   through `LihimSemaphore.validate_frozen_proof` after this contract has
//!   checked `proof.root == frozen_root` itself.
//! - Nullifiers are spent in this contract's own namespace in the semaphore
//!   (`caller = env.current_contract_address()`). Only this contract can
//!   authorize that namespace, so a vote proof replayed straight into the
//!   semaphore by someone who saw it in flight does not block the vote.
//! - Polls below `min_members` active members are rejected (small-group
//!   inference).

#![no_std]

use lihim_common::{
    require_admin_sig, Poll, PollKind, Proof, SemaphoreClient, BUMP_AMOUNT, BUMP_THRESHOLD,
};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    IntoVal, Val, Vec, U256,
};

/// Upper bound on options for a single-choice poll.
pub const MAX_OPTIONS: u32 = 32;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    PollNotFound = 200,
    TooFewMembers = 201,
    InvalidKind = 202,
    InvalidCloseTime = 203,
    PollClosed = 204,
    WrongRoot = 205,
    WrongScope = 206,
    ChoiceOutOfRange = 207,
    AlreadyVoted = 208,
    NotYetClosable = 209,
    AlreadyClosed = 210,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    // instance
    Semaphore,
    MinMembers,
    NextPollId,
    // persistent
    Poll(u64),
    Tally(u64),
    Voters(u64),
    /// Admin nonce per group for `create_poll` (separate from the
    /// semaphore's nonce; the digest binds this contract's address).
    Nonce(u64),
}

#[contractevent(topics = ["poll_created"], data_format = "vec")]
pub struct PollCreated {
    #[topic]
    pub poll_id: u64,
    pub group_id: u64,
    pub kind_tag: u32,
    pub n_options: u32,
    pub frozen_root: U256,
    pub frozen_size: u32,
    pub closes_at: u64,
    pub meta_hash: BytesN<32>,
}

#[contractevent(topics = ["voted"], data_format = "vec")]
pub struct Voted {
    #[topic]
    pub poll_id: u64,
    pub nullifier: U256,
    pub choice: u32,
}

/// Data is void (`()`).
#[contractevent(topics = ["poll_closed"], data_format = "single-value")]
pub struct PollClosed {
    #[topic]
    pub poll_id: u64,
}

#[contract]
pub struct LihimPolls;

#[contractimpl]
impl LihimPolls {
    /// `first_poll_id` exists so a redeployed LihimPolls pointing at the same
    /// LihimSemaphore can start above the old deployment's ids. Scope = poll
    /// id, so a reused id gives each member the same nullifier in both
    /// deployments, which links their votes across the two polls. (Each
    /// deployment has its own nullifier namespace, so reuse would not block
    /// voting, only unlinkability.)
    pub fn __constructor(env: Env, semaphore: Address, min_members: u32, first_poll_id: u64) {
        let s = env.storage().instance();
        s.set(&DataKey::Semaphore, &semaphore);
        s.set(&DataKey::MinMembers, &min_members);
        s.set(&DataKey::NextPollId, &first_poll_id.max(1));
    }

    /// Open a poll on `group_id`, freezing its current root and member count.
    /// Signed by the group admin key with fn tag `create_poll`, nonce
    /// `nonce(group_id)` of this contract, args `(kind, closes_at, meta_hash)`.
    pub fn create_poll(
        env: Env,
        group_id: u64,
        kind: PollKind,
        closes_at: u64,
        meta_hash: BytesN<32>,
        sig: BytesN<64>,
    ) -> Result<u64, Error> {
        if let PollKind::Single(n) = kind {
            if !(2..=MAX_OPTIONS).contains(&n) {
                return Err(Error::InvalidKind);
            }
        }
        let now = env.ledger().timestamp();
        if closes_at <= now {
            return Err(Error::InvalidCloseTime);
        }

        let group = semaphore(&env).group(&group_id);
        let nonce_key = DataKey::Nonce(group_id);
        let nonce: u64 = env.storage().persistent().get(&nonce_key).unwrap_or(0);
        require_admin_sig(
            &env,
            &group.admin,
            &sig,
            "create_poll",
            group_id,
            nonce,
            (kind.clone(), closes_at, meta_hash.clone()),
        );
        set_persistent(&env, &nonce_key, &(nonce + 1));

        let min: u32 = env.storage().instance().get(&DataKey::MinMembers).unwrap();
        if group.members < min {
            return Err(Error::TooFewMembers);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextPollId).unwrap();
        env.storage()
            .instance()
            .set(&DataKey::NextPollId, &(id + 1));
        bump_instance(&env);

        let n_options = kind.n_options();
        let poll = Poll {
            group_id,
            creator_key: group.admin,
            kind: kind.clone(),
            frozen_root: group.root,
            frozen_size: group.members,
            opens_at: now,
            closes_at,
            meta_hash,
            closed: false,
        };
        let mut tally = Vec::new(&env);
        for _ in 0..n_options {
            tally.push_back(0u32);
        }
        set_persistent(&env, &DataKey::Poll(id), &poll);
        set_persistent(&env, &DataKey::Tally(id), &tally);
        set_persistent(&env, &DataKey::Voters(id), &0u32);

        PollCreated {
            poll_id: id,
            group_id,
            kind_tag: kind.tag(),
            n_options,
            frozen_root: poll.frozen_root,
            frozen_size: poll.frozen_size,
            closes_at,
            meta_hash: poll.meta_hash,
        }
        .publish(&env);
        Ok(id)
    }

    /// Record one anonymous vote. No signer: the proof is the authorization,
    /// and the relay that submits it learns nothing it can act on.
    pub fn vote(env: Env, poll_id: u64, proof: Proof) -> Result<(), Error> {
        let poll = load_poll(&env, poll_id)?;
        if poll.closed || env.ledger().timestamp() >= poll.closes_at {
            return Err(Error::PollClosed);
        }
        if proof.root != poll.frozen_root {
            return Err(Error::WrongRoot);
        }
        if proof.scope != U256::from_u128(&env, poll_id as u128) {
            return Err(Error::WrongScope);
        }
        let choice = proof
            .message
            .to_u128()
            .and_then(|m| u32::try_from(m).ok())
            .ok_or(Error::ChoiceOutOfRange)?;
        let bucket = match poll.kind {
            PollKind::Single(n) if choice < n => choice,
            PollKind::YesNo if choice < 2 => choice,
            PollKind::Rating if (1..=5).contains(&choice) => choice - 1,
            _ => return Err(Error::ChoiceOutOfRange),
        };

        let sem = semaphore(&env);
        let me = env.current_contract_address();
        // Checked here so the relay gets a distinct "already answered" code
        // instead of the semaphore's generic failure.
        if sem.has_nullifier(&me, &poll.group_id, &proof.nullifier) {
            return Err(Error::AlreadyVoted);
        }
        let nullifier = proof.nullifier.clone();
        sem.validate_frozen_proof(&me, &poll.group_id, &proof);

        let tally_key = DataKey::Tally(poll_id);
        let mut tally: Vec<u32> = env.storage().persistent().get(&tally_key).unwrap();
        tally.set(bucket, tally.get_unchecked(bucket) + 1);
        set_persistent(&env, &tally_key, &tally);
        let voters_key = DataKey::Voters(poll_id);
        let voters: u32 = env.storage().persistent().get(&voters_key).unwrap_or(0);
        set_persistent(&env, &voters_key, &(voters + 1));
        bump(&env, &DataKey::Poll(poll_id));
        bump_instance(&env);

        Voted {
            poll_id,
            nullifier,
            choice,
        }
        .publish(&env);
        Ok(())
    }

    /// Anyone may close a poll once `closes_at` has passed.
    pub fn close(env: Env, poll_id: u64) -> Result<(), Error> {
        let mut poll = load_poll(&env, poll_id)?;
        if poll.closed {
            return Err(Error::AlreadyClosed);
        }
        if env.ledger().timestamp() < poll.closes_at {
            return Err(Error::NotYetClosable);
        }
        poll.closed = true;
        set_persistent(&env, &DataKey::Poll(poll_id), &poll);
        PollClosed { poll_id }.publish(&env);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    pub fn poll(env: Env, poll_id: u64) -> Result<Poll, Error> {
        load_poll(&env, poll_id)
    }

    /// Counts per option. Rating polls: index 0 = rating 1 ... index 4 = 5.
    pub fn tally(env: Env, poll_id: u64) -> Result<Vec<u32>, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Tally(poll_id))
            .ok_or(Error::PollNotFound)
    }

    pub fn voters_count(env: Env, poll_id: u64) -> Result<u32, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Voters(poll_id))
            .ok_or(Error::PollNotFound)
    }

    pub fn nonce(env: Env, group_id: u64) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::Nonce(group_id))
            .unwrap_or(0)
    }

    pub fn next_poll_id(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextPollId).unwrap()
    }

    pub fn min_members(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::MinMembers).unwrap()
    }

    pub fn semaphore(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Semaphore).unwrap()
    }

    /// Keeper hook: extend TTL of a poll's entries. Anyone may call.
    pub fn bump_poll(env: Env, poll_id: u64) -> Result<(), Error> {
        load_poll(&env, poll_id)?;
        bump_instance(&env);
        for key in [
            DataKey::Poll(poll_id),
            DataKey::Tally(poll_id),
            DataKey::Voters(poll_id),
        ] {
            bump(&env, &key);
        }
        Ok(())
    }
}

fn semaphore(env: &Env) -> SemaphoreClient<'_> {
    let addr: Address = env.storage().instance().get(&DataKey::Semaphore).unwrap();
    SemaphoreClient::new(env, &addr)
}

fn load_poll(env: &Env, poll_id: u64) -> Result<Poll, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Poll(poll_id))
        .ok_or(Error::PollNotFound)
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

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
}

#[cfg(test)]
mod test;

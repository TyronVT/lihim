//! Lean Incremental Merkle Tree, ported from zk-kit's `InternalLeanIMT.sol`
//! (privacy-scaling-explorations/zk-kit.solidity, packages/lean-imt).
//!
//! LeanIMT differs from a classic IMT in two ways that matter for root
//! compatibility with `@semaphore-protocol/group`:
//! - depth grows with size (`depth = ceil(log2(size))`, 0 for one leaf), and
//! - a node without a right sibling is carried up unchanged (no zero-hash).
//!
//! Only "side nodes" (one per level, plus the root at `side[depth]`) are kept
//! on chain; updates and removals take the sibling path as input.

use soroban_poseidon::PoseidonSponge;
use soroban_sdk::{crypto::bn254::Bn254Fr, vec, Env, Vec, U256};

/// Poseidon(2) with circomlib's BN254 parameters (t = 3).
pub struct Hasher {
    env: Env,
    sponge: PoseidonSponge<3, Bn254Fr>,
}

impl Hasher {
    /// Build the sponge once per invocation: constructing it rebuilds the
    /// round-constant and MDS tables as host objects.
    pub fn new(env: &Env) -> Self {
        Self {
            env: env.clone(),
            sponge: PoseidonSponge::<3, Bn254Fr>::new(env),
        }
    }

    pub fn hash(&mut self, left: &U256, right: &U256) -> U256 {
        self.sponge
            .compute_hash(&vec![&self.env, left.clone(), right.clone()])
    }
}

#[derive(Debug, Eq, PartialEq)]
pub enum ImtError {
    WrongSiblingNodes,
}

pub struct Tree {
    pub side: Vec<U256>,
    pub size: u32,
    pub depth: u32,
}

impl Tree {
    pub fn root(&self, env: &Env) -> U256 {
        self.side_at(env, self.depth)
    }

    fn side_at(&self, env: &Env, level: u32) -> U256 {
        self.side
            .get(level)
            .unwrap_or_else(|| U256::from_u32(env, 0))
    }

    fn set_side(&mut self, env: &Env, level: u32, node: U256) {
        while self.side.len() <= level {
            self.side.push_back(U256::from_u32(env, 0));
        }
        self.side.set(level, node);
    }

    /// Insert one leaf (already validated: non-zero, < r, not present).
    /// Returns the new root.
    pub fn insert(&mut self, env: &Env, h: &mut Hasher, leaf: U256) -> U256 {
        let index = self.size as u64;
        let mut depth = self.depth;
        // An insertion grows depth by at most one, and only when the current
        // depth cannot hold one more leaf.
        if (1u64 << depth) < index + 1 {
            depth += 1;
        }
        self.depth = depth;

        let mut node = leaf;
        for level in 0..depth {
            if (index >> level) & 1 == 1 {
                node = h.hash(&self.side_at(env, level), &node);
            } else {
                self.set_side(env, level, node.clone());
            }
        }
        self.size += 1;
        self.set_side(env, depth, node.clone());
        node
    }

    /// Batch insert, computing each new internal node once rather than
    /// re-walking the path per leaf. Leaves are already validated and the
    /// batch is non-empty.
    pub fn insert_many(&mut self, env: &Env, h: &mut Hasher, leaves: &Vec<U256>) -> U256 {
        let tree_size = self.size as u64;
        let n = leaves.len() as u64;

        let mut depth = self.depth;
        while (1u64 << depth) < tree_size + n {
            depth += 1;
        }
        self.depth = depth;

        let mut cur_nodes = leaves.clone();
        let mut cur_start = tree_size;
        let mut cur_size = tree_size + n;
        let mut next_start = cur_start >> 1;
        let mut next_size = ((cur_size - 1) >> 1) + 1;

        for level in 0..depth {
            let mut next_nodes = Vec::new(env);
            for i in 0..(next_size - next_start) {
                let li = (i + next_start) * 2;
                let left = if li < cur_start {
                    self.side_at(env, level)
                } else {
                    cur_nodes.get_unchecked((li - cur_start) as u32)
                };
                let parent = if li + 1 < cur_size {
                    let right = cur_nodes.get_unchecked((li + 1 - cur_start) as u32);
                    h.hash(&left, &right)
                } else {
                    left
                };
                next_nodes.push_back(parent);
            }

            let len = cur_nodes.len();
            if cur_size & 1 == 1 {
                self.set_side(env, level, cur_nodes.get_unchecked(len - 1));
            } else if len > 1 {
                self.set_side(env, level, cur_nodes.get_unchecked(len - 2));
            }

            cur_start = next_start;
            next_start >>= 1;
            cur_nodes = next_nodes;
            cur_size = next_size;
            next_size = ((next_size - 1) >> 1) + 1;
        }

        self.size = (tree_size + n) as u32;
        let root = cur_nodes.get_unchecked(0);
        self.set_side(env, depth, root.clone());
        root
    }

    /// Replace the leaf at `index` (whose current value is `old_leaf`) with
    /// `new_leaf` (0 = remove). `siblings` is the LeanIMT Merkle path, which
    /// omits levels where the node has no sibling. Siblings are already
    /// validated as < r. On error `self` may be partially modified and must
    /// be discarded (callers only persist on `Ok`).
    pub fn update(
        &mut self,
        env: &Env,
        h: &mut Hasher,
        index: u32,
        old_leaf: U256,
        new_leaf: U256,
        siblings: &Vec<U256>,
    ) -> Result<U256, ImtError> {
        let index = index as u64;
        let last_index = (self.size - 1) as u64;
        let mut node = new_leaf;
        let mut old_root = old_leaf;
        let mut i = 0u32;
        let depth = self.depth;

        for level in 0..depth {
            if (index >> level) & 1 == 1 {
                let sib = siblings.get(i).ok_or(ImtError::WrongSiblingNodes)?;
                node = h.hash(&sib, &node);
                old_root = h.hash(&sib, &old_root);
                i += 1;
            } else if index >> level != last_index >> level {
                let sib = siblings.get(i).ok_or(ImtError::WrongSiblingNodes)?;
                // The stored side node at this level may be the very node we
                // are replacing (left child of the rightmost pair).
                if self.side_at(env, level) == old_root {
                    self.set_side(env, level, node.clone());
                }
                node = h.hash(&node, &sib);
                old_root = h.hash(&old_root, &sib);
                i += 1;
            } else {
                // Rightmost node with no sibling: carried up, and it is the
                // side node for this level.
                self.set_side(env, level, node.clone());
            }
        }

        if old_root != self.root(env) {
            return Err(ImtError::WrongSiblingNodes);
        }
        self.set_side(env, depth, node.clone());
        Ok(node)
    }
}

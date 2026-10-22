#!/usr/bin/env node
// Generates the M0 compatibility vectors consumed by the contract tests.
//
//   node generate.mjs --deps <dir with node_modules> --out <dir>
//
// <deps> must contain (npm install there):
//   @semaphore-protocol/{identity,group,proof}@4.14.5 poseidon-lite@0.3.0
//   ethers@6 @zk-kit/semaphore-artifacts@4.13.0
// Deps are resolved from --deps so this script never needs its own
// package.json (contracts/ is a Cargo workspace, not an npm package).
//
// Everything is deterministic except Groth16 proofs, which are randomized by
// snarkjs; the tests only rely on them verifying, not on their exact bytes.

import { createRequire } from "node:module"
import { writeFileSync, readFileSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { toSorobanVk } from "../scripts/vk-to-soroban.mjs"

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
)
if (!args.deps || !args.out) {
    console.error("usage: node generate.mjs --deps <dir> --out <dir>")
    process.exit(2)
}
const depsDir = resolve(args.deps)
const outDir = resolve(args.out)
mkdirSync(outDir, { recursive: true })

const req = createRequire(join(depsDir, "package.json"))
const load = async (name) => import(pathToFileURL(req.resolve(name)).href)

const { Identity } = await load("@semaphore-protocol/identity")
const { Group } = await load("@semaphore-protocol/group")
const { generateProof } = await load("@semaphore-protocol/proof")
const { poseidon2 } = await load("poseidon-lite")
const { keccak256, toBeHex } = await load("ethers")
const snarkjs = await load("snarkjs")
const artifactsDir = join(depsDir, "node_modules", "@zk-kit", "semaphore-artifacts")

const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
const s = (x) => x.toString()
const write = (name, data) => {
    writeFileSync(join(outDir, name), JSON.stringify(data, null, 2) + "\n")
    console.log("wrote", name)
}

// Same as @semaphore-protocol/proof src/hash.ts (not exported by the package).
const semaphoreHash = (x) => BigInt(keccak256(toBeHex(x, 32))) >> 8n

// 1. Poseidon(2), circomlib params, as used by @zk-kit/lean-imt.
{
    const pairs = [
        [0n, 0n], [1n, 2n], [0n, 1n], [1n, 0n], [R - 1n, R - 1n], [R - 1n, 0n], [2n ** 128n, 2n ** 64n],
        [123456789n, 987654321n], [2n ** 253n, 3n], [5n, 2n ** 253n + 7n]
    ]
    // Plus chained values so inputs look like real tree nodes.
    let a = 42n
    let b = 4242n
    while (pairs.length < 20) {
        const h = poseidon2([a, b])
        pairs.push([h, a])
        b = a
        a = h
    }
    write("poseidon.json", pairs.map(([x, y]) => ({ a: s(x), b: s(y), hash: s(poseidon2([x, y])) })))
}

// 2. keccak hash(x) for messages and scopes.
{
    const xs = [0n, 1n, 2n, 5n, 255n, 256n, 2n ** 64n - 1n, 2n ** 64n, R - 1n, 2n ** 256n - 1n]
    write("keccak.json", xs.map((x) => ({ x: s(x), hash: s(semaphoreHash(x)) })))
}

// 3. LeanIMT: 10 commitments, root after each insert, then an update and a remove.
const identities = Array.from({ length: 10 }, (_, i) => new Identity(`lihim-m0-identity-${i}`))
{
    const group = new Group()
    const steps = []
    for (const id of identities) {
        group.addMember(id.commitment)
        steps.push({ commitment: s(id.commitment), root: s(group.root), depth: group.depth })
    }
    const updIndex = 7
    const updNew = new Identity("lihim-m0-replacement").commitment
    const updProof = group.generateMerkleProof(updIndex)
    group.updateMember(updIndex, updNew)
    const update = { index: updIndex, old: steps[updIndex].commitment, new: s(updNew), siblings: updProof.siblings.map(s), root: s(group.root) }

    const rmIndex = 3
    const rmProof = group.generateMerkleProof(rmIndex)
    group.removeMember(rmIndex)
    const remove = { index: rmIndex, old: steps[rmIndex].commitment, siblings: rmProof.siblings.map(s), root: s(group.root) }

    write("leanimt.json", { inserts: steps, update, remove })
}

// 4. Groth16 proofs at depth 4 and 10, plus the matching verification keys.
{
    const group = new Group(identities.map((i) => i.commitment))
    const out = []
    for (const depth of [4, 10]) {
        const snarkArtifacts = {
            wasm: join(artifactsDir, `semaphore-${depth}.wasm`),
            zkey: join(artifactsDir, `semaphore-${depth}.zkey`)
        }
        const message = 1n
        const scope = 42n
        const proof = await generateProof(identities[2], group, message, scope, depth, snarkArtifacts)

        // Sanity: verify off-chain with snarkjs before handing it to Rust.
        const vk = JSON.parse(readFileSync(join(artifactsDir, `semaphore-${depth}.json`), "utf8"))
        const signals = [proof.merkleTreeRoot, proof.nullifier, semaphoreHash(message), semaphoreHash(scope)].map(s)
        const p = proof.points
        const unpacked = {
            pi_a: [p[0], p[1], "1"],
            pi_b: [[p[3], p[2]], [p[5], p[4]], ["1", "0"]],
            pi_c: [p[6], p[7], "1"],
            protocol: "groth16",
            curve: "bn128"
        }
        if (!(await snarkjs.groth16.verify(vk, signals, unpacked))) throw new Error(`depth ${depth}: off-chain verify failed`)

        out.push({
            depth,
            proof: {
                depth: proof.merkleTreeDepth,
                root: s(proof.merkleTreeRoot),
                nullifier: s(proof.nullifier),
                message: s(proof.message),
                scope: s(proof.scope),
                points: proof.points.map(s)
            },
            signals,
            vk: toSorobanVk(vk)
        })
    }
    write("groth16.json", out)
}

process.exit(0)

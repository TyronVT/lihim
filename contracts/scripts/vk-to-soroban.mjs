#!/usr/bin/env node
// Convert snarkjs Semaphore verification keys into LihimVerifier `set_vk`
// arguments (JSON accepted by `stellar contract invoke ... -- set_vk --vk`).
//
//   node vk-to-soroban.mjs <artifacts dir with semaphore-<d>.json> <out dir>
//
// The artifacts dir is node_modules/@zk-kit/semaphore-artifacts (npm package
// @zk-kit/semaphore-artifacts@4.13.0, the version @semaphore-protocol/proof
// 4.14.x downloads). Writes <out>/<depth>.json for every depth found.
// TODO(M0): confirm these keys are byte-identical to the ones embedded in the
// deployed SemaphoreVerifier.sol (final PSE ceremony) before mainnet.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const fe = (x) => BigInt(x).toString(16).padStart(64, "0")
const g1 = (p) => fe(p[0]) + fe(p[1])
// snarkjs stores Fp2 as [c0, c1]; Soroban's BN254 encoding is be(c1) || be(c0).
const g2 = (p) => fe(p[0][1]) + fe(p[0][0]) + fe(p[1][1]) + fe(p[1][0])

/** snarkjs vk JSON -> lihim_common::VerificationKey with hex BytesN fields. */
export function toSorobanVk(vk) {
    if (vk.protocol !== "groth16" || vk.curve !== "bn128" || vk.nPublic !== 4) {
        throw new Error("expected a groth16/bn128 key with 4 public signals")
    }
    return {
        alpha1: g1(vk.vk_alpha_1),
        beta2: g2(vk.vk_beta_2),
        gamma2: g2(vk.vk_gamma_2),
        delta2: g2(vk.vk_delta_2),
        ic: vk.IC.map(g1)
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [src, out] = process.argv.slice(2)
    if (!src || !out) {
        console.error("usage: node vk-to-soroban.mjs <artifacts dir> <out dir>")
        process.exit(2)
    }
    mkdirSync(out, { recursive: true })
    let n = 0
    for (const f of readdirSync(src)) {
        const m = /^semaphore-(\d+)\.json$/.exec(f)
        if (!m) continue
        const vk = toSorobanVk(JSON.parse(readFileSync(join(src, f), "utf8")))
        writeFileSync(join(out, `${m[1]}.json`), JSON.stringify(vk) + "\n")
        n += 1
    }
    console.log(`wrote ${n} keys to ${out}`)
}

#!/usr/bin/env node
// Rebuilds admin-auth.json and scval.json from scratch with the JS libraries
// the app uses, following the recipes in ../INTERFACE.md, and checks every
// byte against the Rust-generated vectors.
//
//   node check-js.mjs --deps <dir with node_modules>
//
// <deps> must contain @stellar/stellar-sdk@17 and @noble/curves@2 (the repo
// root after `npm install` works). Exit 0 when every vector matches.

import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createHash } from "node:crypto"

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
)
if (!args.deps) {
    console.error("usage: node check-js.mjs --deps <dir>")
    process.exit(2)
}
const req = createRequire(join(resolve(args.deps), "package.json"))
const load = async (name) => import(pathToFileURL(req.resolve(name)).href)

const { Address, nativeToScVal, xdr } = await load("@stellar/stellar-sdk")
const { ed25519 } = await load("@noble/curves/ed25519.js")

const here = dirname(fileURLToPath(import.meta.url))
const vectors = (name) => JSON.parse(readFileSync(join(here, name), "utf8"))
const hex = (u8) => Buffer.from(u8).toString("hex")

// --- encodings (INTERFACE.md "ScVal encodings") ------------------------------
const u32 = (n) => xdr.ScVal.scvU32(n)
const u64 = (n) => nativeToScVal(BigInt(n), { type: "u64" })
const u256 = (n) => nativeToScVal(BigInt(n), { type: "u256" })
const sym = (s) => xdr.ScVal.scvSymbol(s)
const bytes = (u8) => xdr.ScVal.scvBytes(Buffer.from(u8))
const vec = (items) => xdr.ScVal.scvVec(items)
const addr = (strkey) => new Address(strkey).toScVal()
/** A `#[contracttype]` struct: ScMap with symbol keys sorted by name. */
const struct = (fields) =>
    xdr.ScVal.scvMap(
        Object.keys(fields)
            .sort()
            .map((k) => new xdr.ScMapEntry({ key: sym(k), val: fields[k] }))
    )
/** A `#[contracttype]` enum variant: Vec[Symbol(name), ...fields]. */
const variant = (name, ...fields) => vec([sym(name), ...fields])
const proof = (p) =>
    struct({
        depth: u32(p.depth),
        root: u256(p.root),
        nullifier: u256(p.nullifier),
        message: u256(p.message),
        scope: u256(p.scope),
        points: vec(p.points.map(u256)),
    })
const durability = (name) => {
    const d = xdr.ContractDataDurability[name]
    return typeof d === "function" ? d() : d
}
const persistentKey = (contract, key) =>
    xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
            contract: new Address(contract).toScAddress(),
            key,
            // A value in @stellar/stellar-sdk 17.3 (a function in older js-xdr).
            durability: durability("persistent"),
        })
    )

// --- admin digest (INTERFACE.md "Admin authorization") -----------------------
function adminDigest(contractStrkey, fnTag, groupId, nonce, argsScVal) {
    const be64 = (n) => {
        const b = Buffer.alloc(8)
        b.writeBigUInt64BE(BigInt(n))
        return b
    }
    return createHash("sha256")
        .update(Buffer.from(contractStrkey, "ascii"))
        .update(Buffer.from(fnTag, "ascii"))
        .update(be64(groupId))
        .update(be64(nonce))
        .update(Buffer.from(argsScVal.toXDR()))
        .digest()
}

let failures = 0
const check = (label, got, want) => {
    if (got !== want) {
        failures++
        console.error(`MISMATCH ${label}\n  got  ${got}\n  want ${want}`)
    }
}

// admin-auth.json: same cases as lihim-semaphore `admin_auth_vectors`.
const seed = Buffer.alloc(32, 7)
const pub = ed25519.getPublicKey(seed)
const meta = Buffer.alloc(32, 9)
const sibs = vec([u256(11), u256(12)])
const adminArgs = [
    vec([bytes(pub)]),
    vec([u256(42)]),
    vec([vec([u256(1), u256(2), u256(3)])]),
    vec([u256(1), u256(4), sibs]),
    vec([u256(2), sibs]),
    vec([variant("Single", u32(3)), u64(1_700_000_000), bytes(meta)]),
    vec([variant("YesNo"), u64(1_700_000_000), bytes(meta)]),
    vec([variant("Rating"), u64(1_700_000_000), bytes(meta)]),
]
const admin = vectors("admin-auth.json")
admin.forEach((v, i) => {
    const label = `admin-auth[${i}] ${v.fn_tag}`
    check(`${label} args_xdr`, hex(adminArgs[i].toXDR()), v.args_xdr_hex)
    const digest = adminDigest(v.contract, v.fn_tag, v.group_id, v.nonce, adminArgs[i])
    check(`${label} digest`, hex(digest), v.digest_hex)
    check(`${label} pub`, hex(pub), v.admin_pub_hex)
    check(`${label} sig`, hex(ed25519.sign(digest, seed)), v.signature_hex)
})

// scval.json: same cases as lihim-semaphore `scval_vectors`.
const SEM = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526"
const POLLS = "CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ"
const VERIFIER = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4"
const values = {
    proof: proof({ depth: 4, root: 1001, nullifier: 77, message: 1, scope: 42, points: [1, 2, 3, 4, 5, 6, 7, 8] }),
    poll_kind_single_3: variant("Single", u32(3)),
    poll_kind_rating: variant("Rating"),
    poll_kind_yesno: variant("YesNo"),
}
const keys = {
    "semaphore Group(1)": [SEM, variant("Group", u64(1))],
    "semaphore Tree(1)": [SEM, variant("Tree", u64(1))],
    "semaphore RootTtl(1)": [SEM, variant("RootTtl", u64(1))],
    "semaphore Nonce(1)": [SEM, variant("Nonce", u64(1))],
    "semaphore Leaf(1, 42)": [SEM, variant("Leaf", u64(1), u256(42))],
    "semaphore Root(1, 1001)": [SEM, variant("Root", u64(1), u256(1001))],
    "semaphore Nullifier(polls, 1, 77)": [SEM, variant("Nullifier", addr(POLLS), u64(1), u256(77))],
    "polls Poll(42)": [POLLS, variant("Poll", u64(42))],
    "polls Tally(42)": [POLLS, variant("Tally", u64(42))],
    "polls Voters(42)": [POLLS, variant("Voters", u64(42))],
    "polls Nonce(1)": [POLLS, variant("Nonce", u64(1))],
    "verifier Vk(4)": [VERIFIER, variant("Vk", u32(4))],
    "semaphore instance": [SEM, xdr.ScVal.scvLedgerKeyContractInstance()],
}
const sc = vectors("scval.json")
for (const v of sc.values) {
    if (!values[v.name]) throw new Error(`no JS case for ${v.name}`)
    check(v.name, hex(values[v.name].toXDR()), v.scval_xdr_hex)
}
for (const v of sc.ledger_keys) {
    if (!keys[v.name]) throw new Error(`no JS case for ${v.name}`)
    const [contract, key] = keys[v.name]
    check(`${v.name} contract`, contract, v.contract)
    check(`${v.name} key`, hex(key.toXDR()), v.key_scval_xdr_hex)
    check(`${v.name} ledger key`, hex(persistentKey(contract, key).toXDR()), v.ledger_key_xdr_hex)
}

const total = admin.length + sc.values.length + sc.ledger_keys.length
if (failures) {
    console.error(`${failures} mismatches`)
    process.exit(1)
}
console.log(`ok: ${admin.length} admin-auth + ${sc.values.length} values + ${sc.ledger_keys.length} ledger keys (${total})`)

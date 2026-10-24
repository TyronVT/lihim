import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/create-app.ts";
import type { SimOutcome, SubmitOutcome, VoteChain } from "../src/chain.ts";
import { createLogger } from "../src/log.ts";
import { createInvalidVoteLimiter } from "../src/rate-limit.ts";

const ORIGIN = "https://lihim.app";
// Real contract codes (contracts/INTERFACE.md §8).
const ALREADY_VOTED = 208; // LihimPolls::AlreadyVoted
const NULLIFIER_USED = 113; // LihimSemaphore::NullifierUsed
const BAD_PROOF = 114; // LihimSemaphore::InvalidProof
const WRONG_ROOT = 205; // LihimPolls::WrongRoot

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    poll_id: "42",
    proof: {
      depth: 10,
      root: "123456789",
      nullifier: "987654321",
      message: "1",
      scope: "42",
      points: ["1", "2", "3", "4", "5", "6", "7", "8"],
      ...overrides,
    },
  };
}

function setup(opts: { sim?: SimOutcome; submit?: SubmitOutcome; maxDelayMs?: number; limit?: number } = {}) {
  const lines: string[] = [];
  const chain = {
    simulateVote: vi.fn(async (): Promise<SimOutcome> => opts.sim ?? { ok: true }),
    submitVote: vi.fn(async (): Promise<SubmitOutcome> => opts.submit ?? { ok: true, txHash: "ab".repeat(32) }),
  } satisfies VoteChain;
  const sleep = vi.fn(async (_ms: number) => {});
  const app = createApp({
    chain,
    log: createLogger((l) => lines.push(l)),
    limiter: createInvalidVoteLimiter(opts.limit ?? 60),
    appOrigin: ORIGIN,
    maxDelayMs: opts.maxDelayMs ?? 0,
    random: () => 0.5,
    sleep,
  });
  const vote = (body: unknown, headers: Record<string, string> = {}) =>
    app.request("/vote", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { app, chain, lines, sleep, vote };
}

describe("identity headers", () => {
  it.each([
    ["cookie", "sb-access-token=abc"],
    ["authorization", "Bearer eyJhbGciOi"],
    ["apikey", "anon-key"],
    ["x-client-info", "supabase-js/2"],
  ])("rejects a vote carrying %s", async (name, value) => {
    const { vote, chain } = setup();
    const res = await vote(validBody(), { [name]: value });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "invalid", reason: "identity_attached" });
    expect(chain.simulateVote).not.toHaveBeenCalled();
  });

  it("never sets a cookie", async () => {
    const { vote } = setup();
    const res = await vote(validBody());
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("body validation", () => {
  it.each<[string, unknown]>([
    ["not json", "{nope"],
    ["array", []],
    ["extra top-level key", { ...validBody(), user_id: "u1" }],
    ["extra proof key", validBody({ device: "x" })],
    ["numeric poll_id", { ...validBody(), poll_id: 42 }],
    ["poll_id over u64", { ...validBody(), poll_id: (1n << 64n).toString() }],
    ["leading zero", validBody({ root: "0123" })],
    ["hex string", validBody({ root: "0x1f" })],
    ["negative", validBody({ nullifier: "-1" })],
    ["value over u256", validBody({ root: (1n << 256n).toString() })],
    ["depth 0", validBody({ depth: 0 })],
    ["depth 33", validBody({ depth: 33 })],
    ["fractional depth", validBody({ depth: 1.5 })],
    ["7 points", validBody({ points: ["1", "2", "3", "4", "5", "6", "7"] })],
    ["numeric point", validBody({ points: [1, "2", "3", "4", "5", "6", "7", "8"] })],
  ])("rejects %s as malformed", async (_label, body) => {
    const { vote, chain } = setup();
    const res = await vote(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "invalid", reason: "malformed" });
    expect(chain.simulateVote).not.toHaveBeenCalled();
  });

  it("rejects scope that is not the poll id before simulating", async () => {
    const { vote, chain } = setup();
    const res = await vote(validBody({ scope: "43" }));
    expect(await res.json()).toEqual({ status: "invalid", reason: "scope_mismatch" });
    expect(chain.simulateVote).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON content type", async () => {
    const { vote } = setup();
    const res = await vote(JSON.stringify(validBody()), { "content-type": "text/plain" });
    expect(res.status).toBe(400);
  });

  it("rejects oversized bodies", async () => {
    const { vote } = setup();
    const res = await vote(validBody({ root: "1".repeat(20_000) }));
    expect(res.status).toBe(400);
  });

  it("passes parsed bigints to the chain", async () => {
    const { vote, chain } = setup();
    await vote(validBody());
    expect(chain.simulateVote).toHaveBeenCalledWith(42n, {
      depth: 10,
      root: 123456789n,
      nullifier: 987654321n,
      message: 1n,
      scope: 42n,
      points: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n],
    });
  });
});

describe("CORS", () => {
  it("allows only APP_ORIGIN, without credentials", async () => {
    const { app } = setup();
    const res = await app.request("/vote", {
      method: "OPTIONS",
      headers: { origin: ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    expect(res.headers.get("access-control-allow-headers")?.toLowerCase()).toBe("content-type");
  });

  it("gives other origins no CORS header", async () => {
    const { app, vote } = setup();
    const pre = await app.request("/vote", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
    const res = await vote(validBody(), { origin: "https://evil.example" });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("outcome mapping", () => {
  it("records a valid vote and returns the tx hash", async () => {
    const { vote, chain } = setup();
    const res = await vote(validBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "recorded", tx_hash: "ab".repeat(32) });
    expect(chain.submitVote).toHaveBeenCalledOnce();
  });

  it.each([
    ["AlreadyVoted", ALREADY_VOTED],
    ["NullifierUsed", NULLIFIER_USED],
  ])("maps %s in simulation to 409 without submitting", async (_name, code) => {
    const { vote, chain } = setup({ sim: { ok: false, kind: "contract", code } });
    const res = await vote(validBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ status: "already_answered" });
    expect(chain.submitVote).not.toHaveBeenCalled();
  });

  it.each([
    ["AlreadyVoted", ALREADY_VOTED],
    ["NullifierUsed", NULLIFIER_USED],
  ])("maps %s lost at submit time to 409", async (_name, code) => {
    const { vote } = setup({ submit: { ok: false, kind: "contract", code } });
    const res = await vote(validBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ status: "already_answered" });
  });

  it("maps a contract rejection at submit time to 400 with its reason", async () => {
    const { vote } = setup({ submit: { ok: false, kind: "contract", code: WRONG_ROOT } });
    const res = await vote(validBody());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "invalid", reason: "root_mismatch" });
  });

  it("maps a rejected proof to 400 without submitting", async () => {
    const { vote, chain } = setup({ sim: { ok: false, kind: "contract", code: BAD_PROOF } });
    const res = await vote(validBody());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "invalid", reason: "bad_proof" });
    expect(chain.submitVote).not.toHaveBeenCalled();
  });

  it("maps unknown contract errors to a generic invalid", async () => {
    const { vote } = setup({ sim: { ok: false, kind: "contract", code: 9999 } });
    expect(await (await vote(validBody())).json()).toEqual({ status: "invalid", reason: "rejected" });
  });

  it("maps a failed submission to 502 not_sent", async () => {
    const { vote } = setup({ submit: { ok: false, kind: "failed" } });
    const res = await vote(validBody());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ status: "not_sent" });
  });

  it("maps RPC transport errors to 502 not_sent", async () => {
    const { vote, chain } = setup();
    chain.simulateVote.mockRejectedValueOnce(new Error("ECONNRESET"));
    const res = await vote(validBody());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ status: "not_sent" });
  });

  it("waits a random delay before submitting, and responds after", async () => {
    const { vote, sleep, chain } = setup({ maxDelayMs: 60_000 });
    const res = await vote(validBody());
    expect(sleep).toHaveBeenCalledWith(30_000);
    expect(sleep.mock.invocationCallOrder[0]).toBeLessThan(chain.submitVote.mock.invocationCallOrder[0]!);
    expect(res.status).toBe(200);
  });

  it("does not delay when RELAY_MAX_DELAY_MS is 0", async () => {
    const { vote, sleep } = setup();
    await vote(validBody());
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("rate limiting by invalid proofs per poll", () => {
  it("stops simulating for a poll after too many invalid proofs", async () => {
    const { vote, chain } = setup({ sim: { ok: false, kind: "contract", code: BAD_PROOF }, limit: 3 });
    for (let i = 0; i < 3; i++) expect((await vote(validBody())).status).toBe(400);
    const blocked = await vote(validBody());
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ status: "not_sent", reason: "busy" });
    expect(chain.simulateVote).toHaveBeenCalledTimes(3);

    // Other polls are unaffected.
    const other = await vote({ ...validBody({ scope: "7" }), poll_id: "7" });
    expect(other.status).toBe(400);
    expect(chain.simulateVote).toHaveBeenCalledTimes(4);
  });

  it("does not count already-answered as invalid", async () => {
    const { vote } = setup({ sim: { ok: false, kind: "contract", code: ALREADY_VOTED }, limit: 1 });
    for (let i = 0; i < 3; i++) expect((await vote(validBody())).status).toBe(409);
  });
});

describe("logging", () => {
  const ip = "203.0.113.77";
  const ua = "Mozilla/5.0 (Linux; Android 14; Pixel 8) LihimTestAgent/1.0";
  const spyHeaders = {
    "x-forwarded-for": ip,
    "x-real-ip": ip,
    "cf-connecting-ip": ip,
    "user-agent": ua,
    referer: "https://lihim.app/g/secret-group",
    "accept-language": "fil-PH",
  };

  it.each<[string, Parameters<typeof setup>[0], unknown, Record<string, string>]>([
    ["recorded", {}, validBody(), {}],
    ["already answered", { sim: { ok: false, kind: "contract", code: NULLIFIER_USED } }, validBody(), {}],
    ["invalid", { sim: { ok: false, kind: "contract", code: BAD_PROOF } }, validBody(), {}],
    ["malformed", {}, { nope: true }, {}],
    ["identity attached", {}, validBody(), { cookie: "sb=1" }],
    ["network error", { submit: { ok: false, kind: "failed" } }, validBody(), {}],
  ])("never logs IP, user agent or headers (%s)", async (_label, opts, body, extra) => {
    const { vote, lines } = setup(opts);
    await vote(body, { ...spyHeaders, ...extra });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(ip);
      expect(line).not.toContain("LihimTestAgent");
      expect(line).not.toContain("secret-group");
      expect(line).not.toContain("fil-PH");
      expect(line).not.toContain("sb=1");
      expect(Object.keys(JSON.parse(line)).every((k) => ["poll_id", "nullifier", "tx_hash", "outcome"].includes(k))).toBe(true);
    }
  });

  it("logs exactly poll_id, nullifier, tx_hash and outcome on success", async () => {
    const { vote, lines } = setup();
    await vote(validBody());
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { poll_id: "42", nullifier: "987654321", tx_hash: "ab".repeat(32), outcome: "recorded" },
    ]);
  });

  it("drops unexpected fields even if a call site passes them", () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l));
    log({ outcome: "x", ip: "1.2.3.4" } as never);
    expect(JSON.parse(lines[0]!)).toEqual({ outcome: "x" });
  });

  it("does not print through console on internal errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, lines } = setup();
    app.get("/boom", () => {
      throw new Error(`leak ${ip}`);
    });
    const res = await app.request("/boom", { headers: spyHeaders });
    expect(res.status).toBe(502);
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(lines.join("")).not.toContain(ip);
    consoleSpy.mockRestore();
  });
});

describe("health", () => {
  it("returns ok", async () => {
    const { app } = setup();
    const res = await app.request("/health");
    expect(await res.json()).toEqual({ ok: true });
  });
});

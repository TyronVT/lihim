import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  AdminTxError,
  adminArgs,
  adminKeyFromSeed,
  bytes,
  canonicalPollMeta,
  pollMetaHash,
  signAdminCall,
  signedAdminArgs,
  submitAdminTx,
  u64,
  type AdminTxBody,
} from "../src/index.js";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const CONTRACT = `C${"A".repeat(55)}`;

describe("pollMetaHash", () => {
  it("matches supabase/functions/_shared/meta.ts byte for byte", () => {
    const canonical = '{"v":1,"kind":"yesno","title":"Approve the 2026 budget?","options":["Yes","No"]}';
    expect(canonicalPollMeta("yesno", "Approve the 2026 budget?", ["Yes", "No"])).toBe(canonical);
    expect(hex(pollMetaHash("yesno", "Approve the 2026 budget?", ["Yes", "No"]))).toBe(
      createHash("sha256").update(canonical).digest("hex"),
    );
  });

  it("uses options: [] for rating polls", () => {
    expect(canonicalPollMeta("rating", "Rate it", null)).toBe('{"v":1,"kind":"rating","title":"Rate it","options":[]}');
  });
});

describe("signedAdminArgs", () => {
  it("is [...leading, ...signed, sig] with the same signature as signAdminCall", () => {
    const admin = adminKeyFromSeed(new Uint8Array(32).fill(7));
    const input = { contractId: CONTRACT, fnTag: "add_members" as const, chainGroupId: 3n, nonce: 2n, args: adminArgs.add_members([5n, 6n]) };
    const args = signedAdminArgs({ ...input, leadingArgs: [u64(3n)] }, admin);
    const { sig } = signAdminCall(input, admin);
    expect(args.map((a) => a.toXDR("hex"))).toEqual([u64(3n), ...input.args, bytes(sig)].map((a) => a.toXDR("hex")));
  });
});

describe("submitAdminTx", () => {
  const body = (attempt: number): AdminTxBody => ({ action: "add_members", group_id: "g", args_xdr: `xdr-${attempt}` });
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });

  it("re-signs and resends after 409 stale_signature", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(reply(409, { status: "stale_signature", reason: "nonce moved" }))
      .mockResolvedValueOnce(reply(200, { status: "confirmed", tx_hash: "ab", group_id: "g" }));
    const build = vi.fn(async (attempt: number) => body(attempt));
    const res = await submitAdminTx({ url: "https://x/functions/v1/submit-admin-tx", accessToken: "jwt", apiKey: "anon", build, fetch });
    expect(res.status).toBe("confirmed");
    expect(build).toHaveBeenCalledTimes(2);
    const [, init] = fetch.mock.calls[1]!;
    expect(JSON.parse(init!.body as string).args_xdr).toBe("xdr-1");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer jwt");
    expect((init!.headers as Record<string, string>).apikey).toBe("anon");
  });

  it("gives up after maxAttempts stale signatures", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => reply(409, { status: "stale_signature", reason: "x" }));
    await expect(submitAdminTx({ url: "u", accessToken: "t", build: async (a) => body(a), fetch, maxAttempts: 2 })).rejects.toMatchObject({
      code: "stale_signature",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry other failures, and keeps the contract error code", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      reply(409, { status: "below_min_members", reason: "needs at least 8 members", error_code: 201 }),
    );
    const err = await submitAdminTx({ url: "u", accessToken: "t", build: async (a) => body(a), fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminTxError);
    expect(err).toMatchObject({ httpStatus: 409, code: "below_min_members", contractErrorCode: 201 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

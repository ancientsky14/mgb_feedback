import { addDays, manilaDate } from "@feedback/shared";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BURST_FLAG_THRESHOLD, HOURLY_CAP, createApp } from "../src/worker/app";
import { ipKey } from "../src/worker/ip";

const BASE = "https://feedback.test";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Siteverify is mocked: the Worker runs in the test isolate, so a spy on fetch reaches it.
let siteverifyResult: Record<string, unknown> = { success: true, hostname: "", action: "" };
const realFetch = globalThis.fetch;
beforeEach(() => {
  siteverifyResult = { success: true, hostname: "", action: "" };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === SITEVERIFY) return Response.json(siteverifyResult);
    return realFetch(input, init);
  });
});
afterEach(() => vi.restoreAllMocks());

const today = () => manilaDate(new Date());
const submission = (overrides: Record<string, unknown> = {}) => ({
  submissionId: crypto.randomUUID(),
  servicePoint: "PACD01",
  instrument: "ARTA-2420-03-ONSITE",
  lang: "en",
  serviceId: 1,
  transactionDate: today(),
  clientType: "citizen",
  sex: null,
  age: 37,
  region: "R01",
  cc1: 1,
  cc2: 1,
  cc3: 1,
  sqd: { sqd0: 5, sqd1: 4, sqd2: 5, sqd3: 4, sqd4: 5, sqd5: 0, sqd6: 5, sqd7: 5, sqd8: 4 },
  suggestion: null,
  email: null,
  turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
  ...overrides,
});

// A different address per request by default, so tests do not trip each other's rate limits.
const randomIp = () => `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  exports.default.fetch(`${BASE}/api/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": randomIp(), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("GET /api/context/:code", () => {
  it("returns the form context for an open service point", async () => {
    const res = await exports.default.fetch(`${BASE}/api/context/pacd01`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      servicePoint: { code: "PACD01" },
      instrumentCode: "ARTA-2420-03-ONSITE",
      languages: ["en"],
      defaultServiceId: 1,
      today: today(),
    });
    // A desk with no division offers every active service, and never an inactive one.
    expect((body.services as { id: number }[]).map((s) => s.id).sort()).toEqual([1, 3, 4, 5]);
  });

  it("limits a division's counter to that division's services", async () => {
    const body = (await (await exports.default.fetch(`${BASE}/api/context/MMD001`)).json()) as { services: { id: number }[] };
    expect(body.services.map((s) => s.id).sort()).toEqual([3, 4]);
  });

  it("gives the online form to an online service point", async () => {
    const body = (await (await exports.default.fetch(`${BASE}/api/context/WEB001`)).json()) as { instrumentCode: string };
    expect(body.instrumentCode).toBe("ARTA-2420-03-ONLINE");
  });

  it.each(["RTD001", "EVT001", "ZZZZZZ", "bad-code"])("does not open %s", async (code) => {
    expect((await exports.default.fetch(`${BASE}/api/context/${code}`)).status).toBe(404);
  });

  it("sends security headers and no caching", async () => {
    const res = await exports.default.fetch(`${BASE}/api/context/PACD01`);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("POST /api/responses", () => {
  it("stores a valid submission and returns a random reference", async () => {
    const s = submission();
    const res = await post(s);
    expect(res.status).toBe(201);
    const { publicRef } = (await res.json()) as { publicRef: string };
    expect(publicRef).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    const row = await env.DB.prepare(`SELECT * FROM responses WHERE public_ref = ?1`).bind(publicRef).first<Record<string, unknown>>();
    expect(row).toMatchObject({
      submission_id: s.submissionId,
      channel: "qr",
      service_point_id: 1,
      sqd5: 0,
      comment_visibility: "cart_only",
      suspect_burst: 0,
    });
  });

  it("returns the same reference for a retry, even though the retry's token is spent", async () => {
    const s = submission();
    const first = (await (await post(s)).json()) as { publicRef: string };
    siteverifyResult = { success: false, "error-codes": ["timeout-or-duplicate"] };
    const retry = await post(s);
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as { publicRef: string }).publicRef).toBe(first.publicRef);
    const { n } = (await env.DB.prepare(`SELECT count(*) AS n FROM responses WHERE submission_id = ?1`).bind(s.submissionId).first<{ n: number }>())!;
    expect(n).toBe(1);
  });

  it("refuses a failed Turnstile check and stores nothing", async () => {
    siteverifyResult = { success: false, "error-codes": ["invalid-input-response"] };
    const s = submission();
    expect((await post(s)).status).toBe(403);
    expect(await env.DB.prepare(`SELECT 1 FROM responses WHERE submission_id = ?1`).bind(s.submissionId).first()).toBeNull();
  });

  it("refuses a token minted for another widget action", async () => {
    siteverifyResult = { success: true, hostname: "", action: "login" };
    expect((await post(submission())).status).toBe(403);
  });

  it("refuses when Siteverify cannot be reached", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async () => {
      throw new TypeError("network down");
    });
    expect((await post(submission())).status).toBe(403);
  });

  it("rejects a broken CC skip rule with a field error", async () => {
    const res = await post(submission({ cc1: 4, cc2: 1, cc3: 4 }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { fields: Record<string, string[]> }).fields).toHaveProperty("cc2");
  });

  it("rejects fields the form does not have", async () => {
    expect((await post({ ...submission(), staffName: "anyone" })).status).toBe(400);
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post(submission({ suggestion: "x".repeat(17 * 1024) }))).status).toBe(413);
  });

  it("asks the client to reload when the form version is not the one in use", async () => {
    const res = await post(submission({ instrument: "ARTA-2420-03-ONLINE" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "form_changed" });
  });

  it("refuses a service the service point does not offer", async () => {
    expect((await post(submission({ servicePoint: "MMD001", serviceId: 5 }))).status).toBe(400);
    expect((await post(submission({ servicePoint: "MMD001", serviceId: 6 }))).status).toBe(400); // inactive
    expect((await post(submission({ servicePoint: "MMD001", serviceId: 3 }))).status).toBe(201);
  });

  it("refuses a closed service point", async () => {
    expect((await post(submission({ servicePoint: "RTD001" }))).status).toBe(409);
  });

  it("refuses future and too-old transaction dates", async () => {
    expect((await post(submission({ transactionDate: addDays(today(), 1) }))).status).toBe(400);
    expect((await post(submission({ transactionDate: addDays(today(), -91) }))).status).toBe(400);
    expect((await post(submission({ transactionDate: addDays(today(), -90) }))).status).toBe(201);
  });

  it("keeps an email apart from the answers, with a purge date", async () => {
    const res = await post(submission({ email: "Client@Example.PH" }));
    const { publicRef } = (await res.json()) as { publicRef: string };
    const contact = await env.DB.prepare(
      `SELECT c.email, c.purge_after FROM response_contacts c JOIN responses r ON r.id = c.response_id WHERE r.public_ref = ?1`,
    )
      .bind(publicRef)
      .first<{ email: string; purge_after: string }>();
    expect(contact).toEqual({ email: "client@example.ph", purge_after: addDays(today(), 365) });
  });

  it("never stores the client's IP address", async () => {
    await post(submission(), { "CF-Connecting-IP": "198.51.100.23" });
    const hit = await env.DB.prepare(`SELECT count(*) AS n FROM rate_buckets WHERE key LIKE '%198.51.100.23%'`).first<{ n: number }>();
    expect(hit?.n).toBe(0);
  });

  it("flags a burst from one address and refuses past the hourly cap", async () => {
    const ip = "192.0.2.50";
    const key = await ipKey("test-ip-hash-secret", ip, today());
    const hour = new Date().toISOString().slice(0, 13);
    await env.DB.prepare(`INSERT INTO rate_buckets (key, window_start, count) VALUES (?1, ?2, ?3)`)
      .bind(key, hour, BURST_FLAG_THRESHOLD)
      .run();
    const flagged = (await (await post(submission(), { "CF-Connecting-IP": ip })).json()) as { publicRef: string };
    const row = await env.DB.prepare(`SELECT suspect_burst FROM responses WHERE public_ref = ?1`).bind(flagged.publicRef).first<{ suspect_burst: number }>();
    expect(row?.suspect_burst).toBe(1);

    await env.DB.prepare(`UPDATE rate_buckets SET count = ?3 WHERE key = ?1 AND window_start = ?2`).bind(key, hour, HOURLY_CAP).run();
    expect((await post(submission(), { "CF-Connecting-IP": ip })).status).toBe(429);
  });

  it("fails closed when its secrets are missing", async () => {
    const app = createApp({ verifyTurnstile: async () => ({ ok: true, codes: [] }), now: () => new Date() });
    const res = await app.request(
      "/api/responses",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submission()) },
      { ...env, TURNSTILE_SECRET_KEY: undefined },
    );
    expect(res.status).toBe(503);
  });
});

describe("Cloudflare's Turnstile test keys", () => {
  const TEST_SITE_KEY = "1x00000000000000000000AA";
  const TEST_SECRET = "1x0000000000000000000000000000000AA";
  const DEPLOYED = "https://mgbr1-feedback-public.example.workers.dev";
  const app = () => createApp({ verifyTurnstile: async () => ({ ok: true, codes: [] }), now: () => new Date() });

  it("stop a deployed Worker from serving the form with the test site key", async () => {
    const res = await app().request(`${DEPLOYED}/api/context/PACD01`, {}, { ...env, TURNSTILE_SITE_KEY: TEST_SITE_KEY });
    expect(res.status).toBe(503);
  });

  it("stop a deployed Worker from accepting submissions with the always-pass secret", async () => {
    const res = await app().request(
      `${DEPLOYED}/api/responses`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submission()) },
      { ...env, TURNSTILE_SECRET_KEY: TEST_SECRET },
    );
    expect(res.status).toBe(503);
  });

  it("still work on localhost, for development", async () => {
    const res = await app().request("http://localhost:5173/api/context/PACD01", {}, {
      ...env,
      TURNSTILE_SITE_KEY: TEST_SITE_KEY,
      TURNSTILE_SECRET_KEY: TEST_SECRET,
    });
    expect(res.status).toBe(200);
  });
});

describe("database guards", () => {
  it("refuses to delete a submitted response", async () => {
    const { publicRef } = (await (await post(submission())).json()) as { publicRef: string };
    await expect(env.DB.prepare(`DELETE FROM responses WHERE public_ref = ?1`).bind(publicRef).run()).rejects.toThrow(
      /official records/,
    );
  });

  it("refuses to change a client's answers", async () => {
    const { publicRef } = (await (await post(submission())).json()) as { publicRef: string };
    await expect(env.DB.prepare(`UPDATE responses SET sqd0 = 1 WHERE public_ref = ?1`).bind(publicRef).run()).rejects.toThrow(
      /cannot be changed/,
    );
    // Releasing a comment to a division is allowed.
    await env.DB.prepare(`UPDATE responses SET comment_visibility = 'released' WHERE public_ref = ?1`).bind(publicRef).run();
  });

  it("keeps the audit log append-only", async () => {
    await env.DB.prepare(`INSERT INTO audit_log (at, actor, action) VALUES ('2026-01-01T00:00:00.000Z', 'system', 'test')`).run();
    await expect(env.DB.prepare(`DELETE FROM audit_log`).run()).rejects.toThrow(/append-only/);
    await expect(env.DB.prepare(`UPDATE audit_log SET actor = 'x'`).run()).rejects.toThrow(/append-only/);
  });
});

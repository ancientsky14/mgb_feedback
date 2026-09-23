import { tallyTemplateRows, toCsv } from "@feedback/shared";
import { env, exports } from "cloudflare:workers";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/worker/app";
import { ROUTE_ROLES } from "../src/worker/routes";
import { runDailyPurge } from "../src/worker/scheduled";

const BASE = "https://admin.test";
const TEAM = "https://team.test";
const AUD = "test-aud";

// A real signing key: tokens are verified by the same code path as production, against a
// key set served from the (mocked) Access certs endpoint.
const { publicKey, privateKey } = await generateKeyPair("RS256");
const outsider = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };

const realFetch = globalThis.fetch;
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
    return realFetch(input, init);
  });
});
afterEach(() => vi.restoreAllMocks());

async function token(email: string, opts: { aud?: string; iss?: string; key?: CryptoKey } = {}) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(opts.iss ?? TEAM)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(opts.key ?? privateKey);
}

async function api(
  path: string,
  opts: { as?: string; token?: string; method?: string; body?: unknown; origin?: string | null; base?: string } = {},
) {
  const base = opts.base ?? BASE;
  const headers: Record<string, string> = {};
  if (opts.as) headers["Cf-Access-Jwt-Assertion"] = await token(opts.as);
  if (opts.token) headers["Cf-Access-Jwt-Assertion"] = opts.token;
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST");
  if (method !== "GET" && opts.origin !== null) headers.Origin = opts.origin ?? base;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return exports.default.fetch(`${base}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

const json = async <T = Record<string, unknown>>(res: Response) => (await res.json()) as T;

describe("sign-in", () => {
  it("refuses a request with no Access token", async () => {
    expect((await api("/api/me")).status).toBe(401);
  });

  it("refuses a token signed by anyone else", async () => {
    expect((await api("/api/me", { token: await token("admin@mgb.test", { key: outsider.privateKey }) })).status).toBe(401);
  });

  it("refuses a token for another Access application or issuer", async () => {
    expect((await api("/api/me", { token: await token("admin@mgb.test", { aud: "other-app" }) })).status).toBe(401);
    expect((await api("/api/me", { token: await token("admin@mgb.test", { iss: "https://evil.test" }) })).status).toBe(401);
  });

  it("refuses a signed-in email that is not active staff", async () => {
    const stranger = await api("/api/me", { as: "stranger@gmail.com" });
    expect(stranger.status).toBe(403);
    expect((await api("/api/me", { as: "former@mgb.test" })).status).toBe(403);
  });

  it("accepts active staff and matches the email case-insensitively", async () => {
    const res = await api("/api/me", { as: "Admin@MGB.test" });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ email: "admin@mgb.test", role: "admin" });
  });

  it("honours the development sign-in only on localhost", async () => {
    expect((await api("/api/me", { base: "http://localhost:5174" })).status).toBe(200);
    expect((await api("/api/me", { base: "https://mgbr1-feedback-admin.example.workers.dev" })).status).toBe(401);
  });

  it("fails closed when Access is not configured", async () => {
    const res = await createApp().request("/api/me", { headers: { "Cf-Access-Jwt-Assertion": await token("admin@mgb.test") } }, {
      ...env,
      ACCESS_TEAM_DOMAIN: "",
      DEV_AUTH_EMAIL: undefined,
    });
    expect(res.status).toBe(503);
  });
});

describe("deny by default", () => {
  it("registers every API route with its roles", () => {
    const app = createApp();
    const apiRoutes = app.routes.filter((r) => r.path.startsWith("/api/") && r.method !== "ALL");
    expect(apiRoutes.length).toBeGreaterThan(20);
    for (const r of apiRoutes) expect(ROUTE_ROLES.has(`${r.method} ${r.path}`), `${r.method} ${r.path}`).toBe(true);
  });

  it("keeps staff and settings admin-only", async () => {
    expect((await api("/api/staff", { as: "cart@mgb.test" })).status).toBe(403);
    expect((await api("/api/staff", { as: "rd@mgb.test" })).status).toBe(403);
    expect((await api("/api/staff", { as: "admin@mgb.test" })).status).toBe(200);
    expect((await api("/api/settings", { as: "focal@mgb.test" })).status).toBe(403);
  });

  it("does not let management or divisions write", async () => {
    expect((await api("/api/paper-responses", { as: "rd@mgb.test", body: {} })).status).toBe(403);
    expect((await api("/api/responses/1/reveal-contact", { as: "focal@mgb.test", body: {} })).status).toBe(403);
  });

  it("refuses writes from another site", async () => {
    expect((await api("/api/services", { as: "cart@mgb.test", body: {}, origin: null })).status).toBe(403);
    expect((await api("/api/services", { as: "cart@mgb.test", body: {}, origin: "https://evil.test" })).status).toBe(403);
  });
});

describe("what a division focal person sees", () => {
  it("lists only their division's responses", async () => {
    const res = await json<{ items: { service_id: number }[] }>(await api("/api/responses", { as: "focal@mgb.test" }));
    expect(new Set(res.items.map((i) => i.service_id))).toEqual(new Set([3, 4]));
  });

  it("cannot open another division's response", async () => {
    expect((await api("/api/responses/9", { as: "focal@mgb.test" })).status).toBe(404);
  });

  it("sees a comment only after CART releases it", async () => {
    const before = await json(await api("/api/responses/1", { as: "focal@mgb.test" }));
    expect(before.suggestion).toBeNull();
    expect(before).not.toHaveProperty("has_contact");
    expect((await api("/api/responses/1/release-comment", { as: "cart@mgb.test", body: {} })).status).toBe(200);
    const after = await json(await api("/api/responses/1", { as: "focal@mgb.test" }));
    expect(after.suggestion).toContain("HYPERLINK");
  });

  it("gets a report limited to the division, with small services hidden", async () => {
    const report = await json<{
      services: { service: { id: number }; suppressed: boolean; respondents: number }[];
      office: { respondents: number };
      officeExcludesHiddenServices: boolean;
    }>(await api("/api/reports/csm?from=2026-09&to=2026-09&division=4", { as: "focal@mgb.test" }));
    // Asked for GD, but a focal person always gets their own division (MMD).
    expect(report.services.map((s) => s.service.id)).toEqual([3, 4]);
    expect(report.services.find((s) => s.service.id === 4)?.suppressed).toBe(true);
    expect(report.office.respondents).toBe(6);
    expect(report.officeExcludesHiddenServices).toBe(true);
  });

  it("CART sees the whole office, unsuppressed", async () => {
    const report = await json<{ services: { suppressed: boolean }[]; office: { respondents: number } }>(
      await api("/api/reports/csm?from=2026-09&to=2026-09", { as: "cart@mgb.test" }),
    );
    expect(report.office.respondents).toBe(10);
    expect(report.services.every((s) => !s.suppressed)).toBe(true);
  });
});

describe("contact details", () => {
  it("are revealed to CART only, and every reveal is audited", async () => {
    const res = await api("/api/responses/1/reveal-contact", { as: "cart@mgb.test", body: { reason: "Client asked for a reply" } });
    expect(await json(res)).toMatchObject({ email: "client@example.ph" });
    const audit = await env.DB.prepare(
      `SELECT actor, detail FROM audit_log WHERE action = 'response.reveal_contact' AND entity_id = '1' ORDER BY id DESC`,
    ).first<{ actor: string; detail: string }>();
    expect(audit?.actor).toBe("cart@mgb.test");
    expect(audit?.detail).not.toContain("client@example.ph");
  });

  it("never appear in the responses export, and formula text is neutralized", async () => {
    const res = await api("/api/export/responses.csv?from=2026-09-01&to=2026-09-30", { as: "cart@mgb.test" });
    const csv = await res.text();
    expect(csv).not.toContain("client@example.ph");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe("paper forms", () => {
  const paper = (overrides: Record<string, unknown> = {}) => ({
    controlNo: "2026-0101",
    servicePointId: 1,
    serviceId: 3,
    instrument: "ARTA-2420-03-ONSITE",
    transactionDate: "2026-09-15",
    clientType: "business",
    sex: null,
    age: null,
    region: null,
    cc1: 2,
    cc2: 1,
    cc3: null,
    sqd: { sqd0: 4, sqd1: 4, sqd2: null, sqd3: 4, sqd4: 4, sqd5: 0, sqd6: 5, sqd7: 5, sqd8: 4 },
    suggestion: null,
    email: null,
    ...overrides,
  });

  it("are typed in with their control number and who encoded them", async () => {
    const res = await api("/api/paper-responses", { as: "cart@mgb.test", body: paper() });
    expect(res.status).toBe(201);
    const { publicRef } = await json<{ publicRef: string }>(res);
    const row = await env.DB.prepare(`SELECT channel, control_no, encoded_by, sqd2 FROM responses WHERE public_ref = ?1`)
      .bind(publicRef)
      .first();
    expect(row).toEqual({ channel: "paper", control_no: "2026-0101", encoded_by: "cart@mgb.test", sqd2: null });
  });

  it("refuses a control number already used this year", async () => {
    expect((await api("/api/paper-responses", { as: "cart@mgb.test", body: paper() })).status).toBe(409);
    // The same number in another year is a different form.
    expect(
      (await api("/api/paper-responses", { as: "cart@mgb.test", body: paper({ transactionDate: "2025-12-15" }) })).status,
    ).toBe(201);
  });

  it("can be corrected, with the changed fields audited", async () => {
    const created = await json<{ publicRef: string }>(
      await api("/api/paper-responses", { as: "cart@mgb.test", body: paper({ controlNo: "2026-0102" }) }),
    );
    const { id } = (await env.DB.prepare(`SELECT id FROM responses WHERE public_ref = ?1`).bind(created.publicRef).first<{ id: number }>())!;
    const res = await api(`/api/paper-responses/${id}`, {
      as: "cart@mgb.test",
      method: "PUT",
      body: paper({ controlNo: "2026-0102", sqd: { ...paper().sqd, sqd2: 5 } }),
    });
    expect(await json(res)).toEqual({ ok: true, changed: ["sqd2"] });
    const audit = await env.DB.prepare(`SELECT detail FROM audit_log WHERE action = 'response.paper_correction' ORDER BY id DESC`).first<{
      detail: string;
    }>();
    expect(JSON.parse(audit!.detail)).toEqual({ fields: ["sqd2"] });
  });

  it("cannot be used to change a client's own online answers", async () => {
    expect((await api("/api/paper-responses/2", { as: "cart@mgb.test", method: "PUT", body: paper({ controlNo: "X" }) })).status).toBe(404);
  });
});

describe("imports", () => {
  const header = [
    "Timestamp",
    "Email Address",
    "Client type",
    "Date",
    "Service Availed",
    "CC1",
    "CC2",
    "CC3",
    ...Array.from({ length: 9 }, (_, i) => `SQD${i}`),
    "Suggestions",
  ];
  const line = (date: string, sqd1: string) => [
    `${date} 9:00:00`,
    "x@example.com",
    "Citizen",
    date,
    "Geohazard",
    "1",
    "Easy to see",
    "Helped very much",
    "Strongly Agree",
    sqd1,
    ...Array.from({ length: 7 }, () => "Agree"),
    "",
  ];
  const csv = (rows: string[][]) => toCsv([header, ...rows]);
  const onlineBody = (text: string, extra: Record<string, unknown> = {}) => ({
    fileName: "old-form.csv",
    text,
    dateOrder: "mdy",
    instrument: "ARTA-2420-03-ONSITE",
    ...extra,
  });

  it("previews without writing, and names rejected rows", async () => {
    const text = csv([line("3/2/2026", "Agree"), line("3/3/2026", "Sort of")]);
    const res = await json<{ acceptedRows: number; rejectedCount: number; rejectedRows: { row: number }[] }>(
      await api("/api/imports/online/preview", { as: "cart@mgb.test", body: onlineBody(text) }),
    );
    expect(res).toMatchObject({ acceptedRows: 1, rejectedCount: 1 });
    expect(res.rejectedRows[0]?.row).toBe(3);
    const { n } = (await env.DB.prepare(`SELECT count(*) AS n FROM responses WHERE channel = 'import'`).first<{ n: number }>())!;
    expect(n).toBe(0);
  });

  it("refuses a partial import unless rejected rows are accepted explicitly", async () => {
    const text = csv([line("3/2/2026", "Agree"), line("3/3/2026", "Sort of")]);
    expect((await api("/api/imports/online/commit", { as: "cart@mgb.test", body: onlineBody(text) })).status).toBe(409);
    const ok = await api("/api/imports/online/commit", { as: "cart@mgb.test", body: onlineBody(text, { allowRejectedRows: true }) });
    expect(await json(ok)).toMatchObject({ imported: 1, rejected: 1 });
  });

  it("replaces its own batch and nothing else", async () => {
    const first = csv([line("4/1/2026", "Agree"), line("4/2/2026", "Agree")]);
    await api("/api/imports/online/commit", { as: "cart@mgb.test", body: onlineBody(first) });
    const { id: batchId } = (await env.DB.prepare(`SELECT max(id) AS id FROM import_batches`).first<{ id: number }>())!;
    const qrBefore = (await env.DB.prepare(`SELECT count(*) AS n FROM responses WHERE channel = 'qr'`).first<{ n: number }>())!.n;

    const corrected = csv([line("4/1/2026", "Agree"), line("4/2/2026", "Agree"), line("4/3/2026", "Agree")]);
    const res = await api("/api/imports/online/commit", { as: "cart@mgb.test", body: onlineBody(corrected, { replaceBatchId: batchId }) });
    expect(res.status).toBe(201);
    const old = await env.DB.prepare(`SELECT count(*) AS n FROM responses WHERE import_batch_id = ?1`).bind(batchId).first<{ n: number }>();
    expect(old?.n).toBe(0);
    const replaced = await env.DB.prepare(`SELECT replaced_by FROM import_batches WHERE id = ?1`).bind(batchId).first<{ replaced_by: number }>();
    expect(replaced?.replaced_by).toBe(batchId + 1);
    const current = await env.DB.prepare(`SELECT count(*) AS n FROM responses WHERE import_batch_id = ?1`).bind(batchId + 1).first<{ n: number }>();
    expect(current?.n).toBe(3);
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM responses WHERE channel = 'qr'`).first<{ n: number }>())!.n).toBe(qrBefore);
    // A batch that was already replaced cannot be replaced again.
    expect((await api("/api/imports/online/commit", { as: "cart@mgb.test", body: onlineBody(corrected, { replaceBatchId: batchId }) })).status).toBe(409);
  });

  it("brings paper tallies into the annual report", async () => {
    const rows = tallyTemplateRows([{ id: 5, name: "Geohazard" }], ["2026-02"]);
    const head = rows[0]!;
    const filled = rows.map((r) => [...r]);
    const set = (column: string, value: string) => {
      filled[1]![head.indexOf(column)] = value;
    };
    set("respondents", "4");
    set("cc1_1", "4");
    set("cc2_1", "4");
    set("cc3_1", "4");
    for (let i = 0; i <= 8; i++) set(`sqd${i}_sa`, "4");
    const body = { fileName: "tally-feb.csv", text: toCsv(filled) };
    const preview = await json<{ records: number; rowErrors: unknown[]; warningCount: number }>(
      await api("/api/imports/tally/preview", { as: "cart@mgb.test", body }),
    );
    expect(preview).toMatchObject({ rowErrors: [], warningCount: 0 });
    expect((await api("/api/imports/tally/commit", { as: "cart@mgb.test", body })).status).toBe(201);

    const report = await json<{ services: { service: { id: number }; respondents: number }[]; includesLegacyTallies: boolean }>(
      await api("/api/reports/csm?from=2026-02&to=2026-02", { as: "cart@mgb.test" }),
    );
    expect(report.includesLegacyTallies).toBe(true);
    expect(report.services.find((s) => s.service.id === 5)?.respondents).toBe(4);
  });
});

describe("settings and staff", () => {
  it("accepts only known settings with valid values", async () => {
    expect((await api("/api/settings/anything", { as: "admin@mgb.test", method: "PUT", body: { value: "1" } })).status).toBe(404);
    expect((await api("/api/settings/contact_retention_days", { as: "admin@mgb.test", method: "PUT", body: { value: "5" } })).status).toBe(400);
    expect((await api("/api/settings/contact_retention_days", { as: "admin@mgb.test", method: "PUT", body: { value: "180" } })).status).toBe(200);
    expect((await api("/api/settings/public_base_url", { as: "admin@mgb.test", method: "PUT", body: { value: "http://plain.test" } })).status).toBe(400);
  });

  it("never lets the last admin lock everyone out", async () => {
    await env.DB.prepare(`UPDATE staff SET active = 0 WHERE email = 'dev@example.com'`).run();
    const res = await api("/api/staff", {
      as: "admin@mgb.test",
      method: "PUT",
      body: { email: "admin@mgb.test", displayName: "Admin", role: "cart" },
    });
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({ error: "last_admin" });
  });

  it("requires a division for a division focal person", async () => {
    const res = await api("/api/staff", {
      as: "admin@mgb.test",
      method: "PUT",
      body: { email: "newfocal@mgb.test", displayName: "New", role: "division_focal" },
    });
    expect(res.status).toBe(400);
  });
});

describe("daily purge", () => {
  it("deletes contact details past their date and records only counts", async () => {
    await env.DB.prepare(`INSERT INTO response_contacts (response_id, email, consent_at, purge_after) VALUES (2, 'old@example.ph', '2025-01-01T00:00:00.000Z', '2025-06-30')`).run();
    const result = await runDailyPurge(env.DB, new Date("2026-09-23T00:00:00Z"));
    expect(result.contacts).toBe(1);
    expect(await env.DB.prepare(`SELECT 1 FROM response_contacts WHERE response_id = 2`).first()).toBeNull();
    expect(await env.DB.prepare(`SELECT 1 FROM response_contacts WHERE response_id = 1`).first()).not.toBeNull();
    const audit = await env.DB.prepare(`SELECT detail FROM audit_log WHERE action = 'retention.daily_purge' ORDER BY id DESC`).first<{ detail: string }>();
    expect(audit?.detail).not.toContain("old@example.ph");
  });
});

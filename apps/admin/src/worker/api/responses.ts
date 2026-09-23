import {
  addDays,
  fieldErrors,
  generatePublicRef,
  isIsoDate,
  manilaDate,
  paperResponseSchema,
  SQD_CODES,
  toCsv,
  type PaperResponse,
} from "@feedback/shared";
import type { Hono } from "hono";
import { auditStatement } from "../audit";
import type { AdminHono, Staff } from "../env";
import { ALL_ROLES, CART_ROLES, route, type AdminContext } from "../routes";

const PAGE_SIZE = 50;

/** Division focal persons see only their division's responses, and a comment only once CART releases it. */
function visibility(staff: Staff) {
  const scoped = staff.role === "division_focal";
  return {
    divisionId: scoped ? staff.divisionId : null,
    commentsReleasedOnly: scoped,
    seesContactFlag: staff.role === "admin" || staff.role === "cart",
  };
}

const SQD_SELECT = SQD_CODES.map((c) => `r.${c}`).join(", ");

export function responseRoutes(app: Hono<AdminHono>) {
  route(app, "GET", "/api/responses", ALL_ROLES, async (c) => {
    const v = visibility(c.get("staff"));
    const from = c.req.query("from") ?? "0000-01-01";
    const to = c.req.query("to") ?? "9999-12-31";
    if (!isIsoDate(from) && from !== "0000-01-01") return c.json({ error: "invalid_from" }, 400);
    if (!isIsoDate(to) && to !== "9999-12-31") return c.json({ error: "invalid_to" }, 400);
    const serviceId = Number(c.req.query("service") ?? "") || null;
    const channel = c.req.query("channel") || null;
    const before = Number(c.req.query("before") ?? "") || null;
    const withComments = c.req.query("comments") === "1";

    const { results } = await c.env.DB.prepare(
      `SELECT r.id, r.public_ref, r.transaction_date, r.submitted_at, r.channel, r.service_id,
              s.name AS service_name, d.code AS division_code, ${SQD_SELECT},
              r.suspect_burst, r.comment_visibility,
              CASE WHEN ?6 = 1 AND r.comment_visibility <> 'released' THEN NULL ELSE r.suggestion END AS suggestion,
              (r.suggestion IS NOT NULL) AS has_suggestion,
              CASE WHEN ?7 = 1 THEN EXISTS (SELECT 1 FROM response_contacts rc WHERE rc.response_id = r.id) ELSE 0 END AS has_contact
         FROM responses r
         JOIN services s ON s.id = r.service_id
         JOIN divisions d ON d.id = s.division_id
        WHERE r.transaction_date BETWEEN ?1 AND ?2
          AND (?3 IS NULL OR r.service_id = ?3)
          AND (?4 IS NULL OR r.channel = ?4)
          AND (?5 IS NULL OR s.division_id = ?5)
          AND (?8 IS NULL OR r.id < ?8)
          AND (?9 = 0 OR r.suggestion IS NOT NULL)
        ORDER BY r.id DESC
        LIMIT ${PAGE_SIZE + 1}`,
    )
      .bind(from, to, serviceId, channel, v.divisionId, v.commentsReleasedOnly ? 1 : 0, v.seesContactFlag ? 1 : 0, before, withComments ? 1 : 0)
      .all<Record<string, unknown> & { id: number }>();
    const page = results.slice(0, PAGE_SIZE);
    return c.json({ items: page, nextBefore: results.length > PAGE_SIZE ? page[page.length - 1]?.id : null });
  });

  route(app, "GET", "/api/responses/:id", ALL_ROLES, async (c) => {
    const staff = c.get("staff");
    const v = visibility(staff);
    const row = await c.env.DB.prepare(
      `SELECT r.*, s.name AS service_name, d.code AS division_code, sp.label AS service_point_label,
              EXISTS (SELECT 1 FROM response_contacts rc WHERE rc.response_id = r.id) AS has_contact
         FROM responses r
         JOIN services s ON s.id = r.service_id
         JOIN divisions d ON d.id = s.division_id
         LEFT JOIN service_points sp ON sp.id = r.service_point_id
        WHERE r.id = ?1 AND (?2 IS NULL OR s.division_id = ?2)`,
    )
      .bind(Number(c.req.param("id")), v.divisionId)
      .first<Record<string, unknown>>();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (v.commentsReleasedOnly && row.comment_visibility !== "released") row.suggestion = null;
    if (!v.seesContactFlag) {
      delete row.has_contact;
      delete row.encoded_by;
    }
    return c.json(row);
  });

  route(app, "POST", "/api/responses/:id/reveal-contact", CART_ROLES, async (c) => {
    const staff = c.get("staff");
    const id = Number(c.req.param("id"));
    const contact = await c.env.DB.prepare(
      `SELECT name, email, phone, consent_at, purge_after FROM response_contacts WHERE response_id = ?1`,
    )
      .bind(id)
      .first();
    if (!contact) return c.json({ error: "not_found" }, 404);
    // Every look at contact details is recorded, with who looked and why.
    const reason = String(((await c.req.json().catch(() => ({}))) as { reason?: unknown }).reason ?? "").slice(0, 200);
    await auditStatement(c.env.DB, {
      actor: staff.email,
      action: "response.reveal_contact",
      entity: "response",
      entityId: id,
      detail: { reason },
    }).run();
    return c.json(contact);
  });

  route(app, "POST", "/api/responses/:id/release-comment", CART_ROLES, async (c) => {
    const staff = c.get("staff");
    const id = Number(c.req.param("id"));
    const [result] = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE responses SET comment_visibility = 'released' WHERE id = ?1 AND suggestion IS NOT NULL AND comment_visibility = 'cart_only'`,
      ).bind(id),
      auditStatement(c.env.DB, { actor: staff.email, action: "response.release_comment", entity: "response", entityId: id }),
    ]);
    if (!result?.meta.changes) return c.json({ error: "nothing_to_release" }, 409);
    return c.json({ ok: true });
  });

  route(app, "POST", "/api/paper-responses", CART_ROLES, async (c) => {
    const staff = c.get("staff");
    const parsed = paperResponseSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid", fields: fieldErrors(parsed.error) }, 400);
    const p = parsed.data;
    const problem = await checkPaperReferences(c, p);
    if (problem) return problem;

    const now = new Date().toISOString();
    const today = manilaDate();
    const retention = await retentionDays(c.env.DB);
    const publicRef = generatePublicRef();
    const statements = [
      c.env.DB.prepare(
        `INSERT INTO responses (public_ref, instrument_code, service_id, service_point_id, channel, lang, transaction_date,
                                client_type, sex, age, region, cc1, cc2, cc3,
                                sqd0, sqd1, sqd2, sqd3, sqd4, sqd5, sqd6, sqd7, sqd8,
                                suggestion, control_no, encoded_by, submitted_at)
         VALUES (?1, ?2, ?3, ?4, 'paper', 'en', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                 ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)`,
      ).bind(
        publicRef,
        p.instrument,
        p.serviceId,
        p.servicePointId,
        p.transactionDate,
        p.clientType,
        p.sex,
        p.age,
        p.region,
        p.cc1,
        p.cc2,
        p.cc3,
        ...SQD_CODES.map((code) => p.sqd[code]),
        p.suggestion,
        p.controlNo,
        staff.email,
        now,
      ),
    ];
    if (p.email) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO response_contacts (response_id, email, consent_at, purge_after)
           SELECT id, ?2, ?3, ?4 FROM responses WHERE public_ref = ?1`,
        ).bind(publicRef, p.email, now, addDays(today, retention)),
      );
    }
    statements.push(
      auditStatement(c.env.DB, {
        actor: staff.email,
        action: "response.paper_entry",
        entity: "response",
        entityId: publicRef,
        detail: { controlNo: p.controlNo },
      }),
    );
    try {
      await c.env.DB.batch(statements);
    } catch (err) {
      if (String(err).includes("responses_paper_control_no") || String(err).includes("control_no")) {
        return c.json({ error: "duplicate_control_no" }, 409);
      }
      throw err;
    }
    return c.json({ publicRef }, 201);
  });

  route(app, "PUT", "/api/paper-responses/:id", CART_ROLES, async (c) => {
    const staff = c.get("staff");
    const id = Number(c.req.param("id"));
    const existing = await c.env.DB.prepare(`SELECT * FROM responses WHERE id = ?1 AND channel = 'paper'`)
      .bind(id)
      .first<Record<string, unknown>>();
    if (!existing) return c.json({ error: "not_found" }, 404);
    const parsed = paperResponseSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid", fields: fieldErrors(parsed.error) }, 400);
    const p = parsed.data;
    const problem = await checkPaperReferences(c, p);
    if (problem) return problem;

    const next: Record<string, unknown> = {
      instrument_code: p.instrument,
      service_id: p.serviceId,
      service_point_id: p.servicePointId,
      transaction_date: p.transactionDate,
      client_type: p.clientType,
      sex: p.sex,
      age: p.age,
      region: p.region,
      cc1: p.cc1,
      cc2: p.cc2,
      cc3: p.cc3,
      ...Object.fromEntries(SQD_CODES.map((code) => [code, p.sqd[code]])),
      suggestion: p.suggestion,
      control_no: p.controlNo,
    };
    const changed = Object.keys(next).filter((k) => existing[k] !== next[k]);
    if (changed.length === 0) return c.json({ ok: true, changed: [] });
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE responses SET ${changed.map((k, i) => `${k} = ?${i + 2}`).join(", ")} WHERE id = ?1 AND channel = 'paper'`,
        ).bind(id, ...changed.map((k) => next[k])),
        // Field names only: the audit log outlives the answers' retention rules.
        auditStatement(c.env.DB, {
          actor: staff.email,
          action: "response.paper_correction",
          entity: "response",
          entityId: id,
          detail: { fields: changed },
        }),
      ]);
    } catch (err) {
      if (String(err).includes("control_no")) return c.json({ error: "duplicate_control_no" }, 409);
      throw err;
    }
    return c.json({ ok: true, changed });
  });

  route(app, "GET", "/api/export/responses.csv", CART_ROLES, async (c) => {
    const staff = c.get("staff");
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) return c.json({ error: "invalid_period" }, 400);
    const { results } = await c.env.DB.prepare(
      `SELECT r.public_ref, r.transaction_date, d.code AS division, s.name AS service, r.channel, r.client_type, r.sex,
              r.age, r.region, r.cc1, r.cc2, r.cc3, ${SQD_SELECT}, r.suggestion, r.control_no, r.submitted_at
         FROM responses r JOIN services s ON s.id = r.service_id JOIN divisions d ON d.id = s.division_id
        WHERE r.transaction_date BETWEEN ?1 AND ?2
        ORDER BY r.transaction_date, r.id`,
    )
      .bind(from, to)
      .all<Record<string, unknown>>();
    const columns = [
      "public_ref",
      "transaction_date",
      "division",
      "service",
      "channel",
      "client_type",
      "sex",
      "age",
      "region",
      "cc1",
      "cc2",
      "cc3",
      ...SQD_CODES,
      "suggestion",
      "control_no",
      "submitted_at",
    ];
    await auditStatement(c.env.DB, {
      actor: staff.email,
      action: "export.responses_csv",
      detail: { from, to, rows: results.length },
    }).run();
    // Contact details are never part of an export.
    return new Response(toCsv([columns, ...results.map((r) => columns.map((k) => r[k]))]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="responses-${from}-to-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}

async function checkPaperReferences(c: AdminContext, p: PaperResponse): Promise<Response | null> {
  const [instrument, service, point] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT 1 AS ok FROM instrument_versions WHERE code = ?1 AND status <> 'draft'`).bind(p.instrument),
    c.env.DB.prepare(`SELECT 1 AS ok FROM services WHERE id = ?1`).bind(p.serviceId),
    c.env.DB.prepare(`SELECT 1 AS ok FROM service_points WHERE id = ?1`).bind(p.servicePointId ?? -1),
  ]);
  if (!instrument?.results.length) return c.json({ error: "invalid", fields: { instrument: ["Unknown form version"] } }, 400);
  if (!service?.results.length) return c.json({ error: "invalid", fields: { serviceId: ["Unknown service"] } }, 400);
  if (p.servicePointId !== null && !point?.results.length) {
    return c.json({ error: "invalid", fields: { servicePointId: ["Unknown service point"] } }, 400);
  }
  if (p.transactionDate > manilaDate()) return c.json({ error: "invalid", fields: { transactionDate: ["Date is in the future"] } }, 400);
  return null;
}

export async function retentionDays(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'contact_retention_days'`).first<{ value: string }>();
  const n = row ? Number.parseInt(row.value, 10) : Number.NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : 365;
}

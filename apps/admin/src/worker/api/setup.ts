import { generateServicePointCode, isIsoDate, isIsoMonth, ROLES } from "@feedback/shared";
import type { Hono } from "hono";
import { z } from "zod";
import { auditStatement } from "../audit";
import type { AdminHono } from "../env";
import { ADMIN_ONLY, ALL_ROLES, CART_ROLES, route, type AdminContext } from "../routes";

const bool01 = z.boolean().transform((b) => (b ? 1 : 0));
const optionalDate = z
  .string()
  .refine((s) => s === "" || isIsoDate(s), "Expected YYYY-MM-DD")
  .transform((s) => (s === "" ? null : s))
  .nullable();

const divisionInput = z.strictObject({
  code: z.string().trim().min(1).max(16),
  name: z.string().trim().min(1).max(120),
  active: bool01.optional(),
});

const serviceInput = z.strictObject({
  divisionId: z.number().int().positive(),
  ccRef: z.string().trim().max(120).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  nameFil: z.string().trim().max(200).nullable().optional(),
  nameIlo: z.string().trim().max(200).nullable().optional(),
  classification: z.enum(["simple", "complex", "highly_technical"]).nullable().optional(),
  processingDays: z.number().int().positive().max(365).nullable().optional(),
  isExternal: bool01.optional(),
  isPlaceholder: bool01.optional(),
  active: bool01.optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

const servicePointInput = z.strictObject({
  label: z.string().trim().min(1).max(120),
  divisionId: z.number().int().positive().nullable().optional(),
  defaultServiceId: z.number().int().positive().nullable().optional(),
  mode: z.enum(["onsite", "online"]).optional(),
  validFrom: optionalDate.optional(),
  validTo: optionalDate.optional(),
  retired: z.boolean().optional(),
});

const staffInput = z.strictObject({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(ROLES),
  divisionId: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
});

/** The only settings the UI may change, each with its own rule. */
const SETTINGS: Record<string, z.ZodType<string>> = {
  contact_retention_days: z.string().regex(/^\d+$/).refine((v) => Number(v) >= 30 && Number(v) <= 3650, "30 to 3650 days"),
  online_max_transaction_age_days: z.string().regex(/^\d+$/).refine((v) => Number(v) >= 1 && Number(v) <= 366, "1 to 366 days"),
  office_overall_method: z.enum(["pooled", "mean_of_services"]),
  public_base_url: z.string().refine((v) => v === "" || /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(v), "An https:// address with no path"),
};

async function readJson(c: AdminContext): Promise<unknown> {
  return c.req.json().catch(() => null);
}

/** Maps a column dictionary to "a = ?2, b = ?3" with values, for PATCH updates of fixed column names. */
function setClause(columns: Record<string, unknown>) {
  const keys = Object.keys(columns).filter((k) => columns[k] !== undefined);
  return { sql: keys.map((k, i) => `${k} = ?${i + 2}`).join(", "), values: keys.map((k) => columns[k]) };
}

export function setupRoutes(app: Hono<AdminHono>) {
  route(app, "GET", "/api/me", ALL_ROLES, (c) => c.json(c.get("staff")));

  route(app, "GET", "/api/meta", ALL_ROLES, async (c) => {
    const [divisions, services, points, instruments, settings] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT id, code, name, active FROM divisions ORDER BY code`),
      c.env.DB.prepare(
        `SELECT id, division_id, cc_ref, name, name_fil, name_ilo, classification, processing_days, is_external, is_placeholder, active, sort_order
           FROM services ORDER BY sort_order, name`,
      ),
      c.env.DB.prepare(
        `SELECT id, code, label, division_id, default_service_id, mode, valid_from, valid_to, retired_at FROM service_points ORDER BY label`,
      ),
      c.env.DB.prepare(`SELECT code, mode, psa_approval_no, psa_expiry, status FROM instrument_versions ORDER BY code`),
      c.env.DB.prepare(`SELECT key, value FROM settings WHERE key IN ('public_base_url', 'contact_retention_days')`),
    ]);
    return c.json({
      divisions: divisions?.results ?? [],
      services: services?.results ?? [],
      servicePoints: points?.results ?? [],
      instruments: instruments?.results ?? [],
      settings: Object.fromEntries(((settings?.results ?? []) as { key: string; value: string }[]).map((s) => [s.key, s.value])),
    });
  });

  // ---- Divisions and services ------------------------------------------------------------

  route(app, "POST", "/api/divisions", CART_ROLES, async (c) => {
    const parsed = divisionInput.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const d = parsed.data;
    const [res] = await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO divisions (code, name, active, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING id`).bind(
        d.code,
        d.name,
        d.active ?? 1,
        new Date().toISOString(),
      ),
      auditStatement(c.env.DB, { actor: c.get("staff").email, action: "division.create", detail: { code: d.code } }),
    ]).catch(uniqueViolation);
    if (!res) return c.json({ error: "duplicate" }, 409);
    return c.json({ id: (res.results[0] as { id: number }).id }, 201);
  });

  route(app, "PATCH", "/api/divisions/:id", CART_ROLES, async (c) => {
    const parsed = divisionInput.partial().safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const { sql, values } = setClause({ code: parsed.data.code, name: parsed.data.name, active: parsed.data.active });
    if (!sql) return c.json({ ok: true });
    const id = Number(c.req.param("id"));
    const [res] = await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE divisions SET ${sql} WHERE id = ?1`).bind(id, ...values),
      auditStatement(c.env.DB, { actor: c.get("staff").email, action: "division.update", entity: "division", entityId: id }),
    ]).catch(uniqueViolation);
    if (!res) return c.json({ error: "duplicate" }, 409);
    return res.meta.changes ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  route(app, "POST", "/api/services", CART_ROLES, async (c) => {
    const parsed = serviceInput.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const s = parsed.data;
    const [res] = await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO services (division_id, cc_ref, name, name_fil, name_ilo, classification, processing_days, is_external,
                               is_placeholder, active, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12) RETURNING id`,
      ).bind(
        s.divisionId,
        s.ccRef ?? null,
        s.name,
        s.nameFil ?? null,
        s.nameIlo ?? null,
        s.classification ?? null,
        s.processingDays ?? null,
        s.isExternal ?? 1,
        s.isPlaceholder ?? 0,
        s.active ?? 1,
        s.sortOrder ?? 0,
        new Date().toISOString(),
      ),
      auditStatement(c.env.DB, { actor: c.get("staff").email, action: "service.create", detail: { name: s.name } }),
    ]).catch(uniqueViolation);
    if (!res) return c.json({ error: "duplicate" }, 409);
    return c.json({ id: (res.results[0] as { id: number }).id }, 201);
  });

  route(app, "PATCH", "/api/services/:id", CART_ROLES, async (c) => {
    const parsed = serviceInput.partial().safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const s = parsed.data;
    const { sql, values } = setClause({
      division_id: s.divisionId,
      cc_ref: s.ccRef,
      name: s.name,
      name_fil: s.nameFil,
      name_ilo: s.nameIlo,
      classification: s.classification,
      processing_days: s.processingDays,
      is_external: s.isExternal,
      is_placeholder: s.isPlaceholder,
      active: s.active,
      sort_order: s.sortOrder,
    });
    if (!sql) return c.json({ ok: true });
    const id = Number(c.req.param("id"));
    const [res] = await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE services SET ${sql} WHERE id = ?1`).bind(id, ...values),
      auditStatement(c.env.DB, {
        actor: c.get("staff").email,
        action: "service.update",
        entity: "service",
        entityId: id,
        detail: { fields: Object.keys(s) },
      }),
    ]).catch(uniqueViolation);
    if (!res) return c.json({ error: "duplicate" }, 409);
    return res.meta.changes ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  // ---- Service points (QR codes) ------------------------------------------------------------

  route(app, "POST", "/api/service-points", CART_ROLES, async (c) => {
    const parsed = servicePointInput.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const p = parsed.data;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateServicePointCode();
      const [res] = await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO service_points (code, label, division_id, default_service_id, mode, valid_from, valid_to, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id, code`,
        ).bind(
          code,
          p.label,
          p.divisionId ?? null,
          p.defaultServiceId ?? null,
          p.mode ?? "onsite",
          p.validFrom ?? null,
          p.validTo ?? null,
          new Date().toISOString(),
        ),
        auditStatement(c.env.DB, { actor: c.get("staff").email, action: "service_point.create", detail: { code, label: p.label } }),
      ]).catch(uniqueViolation);
      if (res) return c.json(res.results[0], 201);
    }
    return c.json({ error: "could_not_allocate_code" }, 503);
  });

  route(app, "PATCH", "/api/service-points/:id", CART_ROLES, async (c) => {
    const parsed = servicePointInput.partial().safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const p = parsed.data;
    // The code itself never changes: it is printed on posters. Retire a point instead.
    const { sql, values } = setClause({
      label: p.label,
      division_id: p.divisionId,
      default_service_id: p.defaultServiceId,
      mode: p.mode,
      valid_from: p.validFrom,
      valid_to: p.validTo,
      retired_at: p.retired === undefined ? undefined : p.retired ? new Date().toISOString() : null,
    });
    if (!sql) return c.json({ ok: true });
    const id = Number(c.req.param("id"));
    const [res] = await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE service_points SET ${sql} WHERE id = ?1`).bind(id, ...values),
      auditStatement(c.env.DB, {
        actor: c.get("staff").email,
        action: p.retired ? "service_point.retire" : "service_point.update",
        entity: "service_point",
        entityId: id,
      }),
    ]);
    return res?.meta.changes ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  // ---- Transaction counts (response-rate denominator) --------------------------------------

  route(app, "GET", "/api/transaction-counts", ALL_ROLES, async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!isIsoMonth(from) || !isIsoMonth(to)) return c.json({ error: "invalid_period" }, 400);
    const { results } = await c.env.DB.prepare(
      `SELECT service_id, month, count, source, entered_by, entered_at FROM transaction_counts WHERE month BETWEEN ?1 AND ?2`,
    )
      .bind(from, to)
      .all();
    return c.json({ items: results });
  });

  route(app, "PUT", "/api/transaction-counts", CART_ROLES, async (c) => {
    const parsed = z
      .strictObject({
        items: z
          .array(z.strictObject({ serviceId: z.number().int().positive(), month: z.string().refine(isIsoMonth), count: z.number().int().min(0) }))
          .min(1)
          .max(500),
      })
      .safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const staff = c.get("staff");
    const now = new Date().toISOString();
    await c.env.DB.batch([
      ...parsed.data.items.map((i) =>
        c.env.DB.prepare(
          `INSERT INTO transaction_counts (service_id, month, count, source, entered_by, entered_at) VALUES (?1, ?2, ?3, 'manual', ?4, ?5)
           ON CONFLICT (service_id, month) DO UPDATE SET count = excluded.count, source = 'manual', entered_by = excluded.entered_by, entered_at = excluded.entered_at`,
        ).bind(i.serviceId, i.month, i.count, staff.email, now),
      ),
      auditStatement(c.env.DB, { actor: staff.email, action: "transaction_counts.update", detail: { entries: parsed.data.items.length } }),
    ]);
    return c.json({ ok: true });
  });

  // ---- Staff and settings (admin only) -------------------------------------------------------

  route(app, "GET", "/api/staff", ADMIN_ONLY, async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT email, display_name, role, division_id, active, created_at FROM staff ORDER BY active DESC, display_name`,
    ).all();
    return c.json({ items: results });
  });

  route(app, "PUT", "/api/staff", ADMIN_ONLY, async (c) => {
    const parsed = staffInput.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const s = parsed.data;
    if (s.role === "division_focal" && !s.divisionId) return c.json({ error: "division_required" }, 400);
    const staff = c.get("staff");
    // Never leave the system without an active admin.
    if (s.email === staff.email || s.role !== "admin" || s.active === false) {
      const other = await c.env.DB.prepare(`SELECT count(*) AS n FROM staff WHERE role = 'admin' AND active = 1 AND email <> ?1`)
        .bind(s.email)
        .first<{ n: number }>();
      const stillAdmin = s.role === "admin" && s.active !== false;
      if (!stillAdmin && (other?.n ?? 0) === 0) return c.json({ error: "last_admin" }, 409);
    }
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO staff (email, display_name, role, division_id, active, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT (email) DO UPDATE SET display_name = excluded.display_name, role = excluded.role,
                                           division_id = excluded.division_id, active = excluded.active`,
      ).bind(s.email, s.displayName, s.role, s.role === "division_focal" ? s.divisionId : (s.divisionId ?? null), s.active === false ? 0 : 1, new Date().toISOString()),
      auditStatement(c.env.DB, {
        actor: staff.email,
        action: "staff.upsert",
        entity: "staff",
        entityId: s.email,
        detail: { role: s.role, active: s.active !== false },
      }),
    ]);
    return c.json({ ok: true });
  });

  route(app, "GET", "/api/settings", ADMIN_ONLY, async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT key, value, updated_by, updated_at FROM settings ORDER BY key`).all();
    return c.json({ items: results });
  });

  route(app, "PUT", "/api/settings/:key", ADMIN_ONLY, async (c) => {
    const key = c.req.param("key") ?? "";
    const rule = Object.hasOwn(SETTINGS, key) ? SETTINGS[key] : undefined;
    if (!rule) return c.json({ error: "unknown_setting" }, 404);
    const value = rule.safeParse(((await readJson(c)) as { value?: unknown } | null)?.value);
    if (!value.success) return c.json({ error: "invalid", message: value.error.issues[0]?.message }, 400);
    const staff = c.get("staff");
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      ).bind(key, value.data, staff.email, new Date().toISOString()),
      auditStatement(c.env.DB, { actor: staff.email, action: "setting.update", entity: "setting", entityId: key, detail: { value: value.data } }),
    ]);
    return c.json({ ok: true });
  });

  route(app, "GET", "/api/audit", ADMIN_ONLY, async (c) => {
    const before = Number(c.req.query("before") ?? "") || null;
    const { results } = await c.env.DB.prepare(
      `SELECT id, at, actor, action, entity, entity_id, detail FROM audit_log WHERE (?1 IS NULL OR id < ?1) ORDER BY id DESC LIMIT 100`,
    )
      .bind(before)
      .all<{ id: number }>();
    return c.json({ items: results, nextBefore: results.length === 100 ? results[results.length - 1]?.id : null });
  });
}

/** Turns a UNIQUE-constraint failure into "no result" so the route can answer 409; rethrows anything else. */
function uniqueViolation(err: unknown): never[] {
  if (String(err).includes("UNIQUE constraint failed")) return [];
  throw err;
}

import {
  detectColumns,
  generatePublicRef,
  getInstrument,
  isIsoMonth,
  manilaDate,
  parseCsv,
  parseOnlineRow,
  parseTallyCsv,
  SQD_CODES,
  tallyTemplateRows,
  toCsv,
  type DateOrder,
  type ImportedRow,
} from "@feedback/shared";
import type { Hono } from "hono";
import { z } from "zod";
import { auditStatement } from "../audit";
import type { AdminHono } from "../env";
import { monthBounds } from "../report-data";
import { CART_ROLES, route, type AdminContext } from "../routes";

// Imports bring in the office's CSM records from before go-live: the old online form's CSV
// export (per response) and paper tally sheets (per service and month). Every import is a
// batch; re-importing replaces that batch and only that batch, in one transaction.

const MAX_FILE_CHARS = 5_000_000;
const CHUNK = 400; // rows per INSERT … SELECT FROM json_each(?)

const fileBody = {
  fileName: z.string().min(1).max(200),
  text: z.string().min(1).max(MAX_FILE_CHARS),
};
const onlineBody = z.strictObject({
  ...fileBody,
  dateOrder: z.enum(["mdy", "dmy"]),
  instrument: z.string().min(1).max(64),
  allowRejectedRows: z.boolean().optional(),
  replaceBatchId: z.number().int().positive().nullable().optional(),
});
const tallyBody = z.strictObject({
  ...fileBody,
  allowWarnings: z.boolean().optional(),
  replaceBatchId: z.number().int().positive().nullable().optional(),
});

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function activeBatchWithHash(db: D1Database, hash: string): Promise<number | null> {
  const row = await db
    .prepare(`SELECT id FROM import_batches WHERE file_sha256 = ?1 AND replaced_by IS NULL ORDER BY id DESC LIMIT 1`)
    .bind(hash)
    .first<{ id: number }>();
  return row?.id ?? null;
}

async function analyzeOnline(c: AdminContext, body: z.infer<typeof onlineBody>) {
  const instrument = getInstrument(body.instrument);
  if (!instrument) return { error: "unknown_instrument" as const };
  let rows: string[][];
  try {
    rows = parseCsv(body.text);
  } catch (err) {
    return { error: "unreadable_csv" as const, message: (err as Error).message };
  }
  const [header = [], ...data] = rows;
  const detection = detectColumns(header);
  const { results: services } = await c.env.DB.prepare(`SELECT id, name FROM services`).all<{ id: number; name: string }>();
  const today = manilaDate();
  const accepted: ImportedRow[] = [];
  const rejected: { row: number; errors: string[] }[] = [];
  const warnings: string[] = [];
  if (detection.missing.length === 0) {
    data.forEach((cells, i) => {
      const r = parseOnlineRow(cells, detection.columns, {
        services,
        instrument,
        dateOrder: body.dateOrder as DateOrder,
        today,
      });
      if (r.ok) {
        accepted.push(r.row);
        for (const w of r.warnings) warnings.push(`Row ${i + 2}: ${w}`);
      } else {
        rejected.push({ row: i + 2, errors: r.errors });
      }
    });
  }
  const months = [...new Set(accepted.map((r) => r.transactionDate.slice(0, 7)))].sort();
  return { instrument, detection, accepted, rejected, warnings, months, dataRows: data.length };
}

export function importRoutes(app: Hono<AdminHono>) {
  route(app, "GET", "/api/imports", CART_ROLES, async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT id, kind, file_name, period_from, period_to, rows_imported, rows_rejected, imported_by, imported_at, replaced_by, note
         FROM import_batches ORDER BY id DESC LIMIT 200`,
    ).all();
    return c.json({ items: results });
  });

  route(app, "POST", "/api/imports/online/preview", CART_ROLES, async (c) => {
    const parsed = onlineBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const a = await analyzeOnline(c, parsed.data);
    if ("error" in a) return c.json(a, 400);
    const hash = await sha256(parsed.data.text);
    const overlap = await existingDataInMonths(c.env.DB, a.months);
    return c.json({
      columns: a.detection.columns,
      ignoredColumns: a.detection.ignored,
      missingColumns: a.detection.missing,
      dataRows: a.dataRows,
      acceptedRows: a.accepted.length,
      rejectedRows: a.rejected.slice(0, 200),
      rejectedCount: a.rejected.length,
      warnings: a.warnings.slice(0, 200),
      warningCount: a.warnings.length,
      months: a.months,
      duplicateOfBatch: await activeBatchWithHash(c.env.DB, hash),
      overlap,
      sample: a.accepted.slice(0, 5),
    });
  });

  route(app, "POST", "/api/imports/online/commit", CART_ROLES, async (c) => {
    const staff = c.get("staff");
    const parsed = onlineBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const body = parsed.data;
    // Parsed again here: what gets written never depends on a preview the browser sent back.
    const a = await analyzeOnline(c, body);
    if ("error" in a) return c.json(a, 400);
    if (a.detection.missing.length > 0) return c.json({ error: "missing_columns", missing: a.detection.missing }, 400);
    if (a.accepted.length === 0) return c.json({ error: "no_rows" }, 400);
    if (a.rejected.length > 0 && !body.allowRejectedRows) {
      return c.json({ error: "rows_rejected", rejectedCount: a.rejected.length }, 409);
    }
    const replace = await replacementCheck(c.env.DB, body.replaceBatchId ?? null, "online_csv");
    if (replace) return c.json(replace, 409);

    const now = new Date().toISOString();
    const hash = await sha256(body.text);
    const records = a.accepted.map((r) => ({
      r: generatePublicRef(),
      s: r.serviceId,
      d: r.transactionDate,
      ct: r.clientType,
      sx: r.sex,
      ag: r.age,
      rg: r.region,
      c1: r.cc1,
      c2: r.cc2,
      c3: r.cc3,
      ...Object.fromEntries(SQD_CODES.map((code, i) => [`q${i}`, r.sqd[code]])),
      sg: r.suggestion,
    }));
    const statements = [
      ...batchHeader(c.env.DB, {
        kind: "online_csv",
        fileName: body.fileName,
        hash,
        from: a.months[0] ?? null,
        to: a.months[a.months.length - 1] ?? null,
        imported: records.length,
        rejected: a.rejected.length,
        by: staff.email,
        at: now,
        replaceBatchId: body.replaceBatchId ?? null,
      }),
    ];
    for (let i = 0; i < records.length; i += CHUNK) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO responses (public_ref, instrument_code, service_id, channel, lang, transaction_date, client_type, sex, age,
                                  region, cc1, cc2, cc3, sqd0, sqd1, sqd2, sqd3, sqd4, sqd5, sqd6, sqd7, sqd8, suggestion,
                                  import_batch_id, submitted_at)
           SELECT json_extract(value, '$.r'), ?2, json_extract(value, '$.s'), 'import', 'en', json_extract(value, '$.d'),
                  json_extract(value, '$.ct'), json_extract(value, '$.sx'), json_extract(value, '$.ag'), json_extract(value, '$.rg'),
                  json_extract(value, '$.c1'), json_extract(value, '$.c2'), json_extract(value, '$.c3'),
                  json_extract(value, '$.q0'), json_extract(value, '$.q1'), json_extract(value, '$.q2'), json_extract(value, '$.q3'),
                  json_extract(value, '$.q4'), json_extract(value, '$.q5'), json_extract(value, '$.q6'), json_extract(value, '$.q7'),
                  json_extract(value, '$.q8'), json_extract(value, '$.sg'),
                  (SELECT max(id) FROM import_batches), ?3
             FROM json_each(?1)`,
        ).bind(JSON.stringify(records.slice(i, i + CHUNK)), a.instrument.code, now),
      );
    }
    statements.push(
      auditStatement(c.env.DB, {
        actor: staff.email,
        action: body.replaceBatchId ? "import.online_replace" : "import.online",
        detail: { file: body.fileName, rows: records.length, rejected: a.rejected.length, replaced: body.replaceBatchId ?? null },
      }),
    );
    await c.env.DB.batch(statements);
    return c.json({ ok: true, imported: records.length, rejected: a.rejected.length }, 201);
  });

  route(app, "GET", "/api/imports/tally-template", CART_ROLES, async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!isIsoMonth(from) || !isIsoMonth(to) || from > to) return c.json({ error: "invalid_period" }, 400);
    const months: string[] = [];
    for (let m = from; m <= to; m = nextMonth(m)) months.push(m);
    if (months.length > 24) return c.json({ error: "period_too_long" }, 400);
    const { results: services } = await c.env.DB.prepare(
      `SELECT id, name FROM services WHERE active = 1 ORDER BY sort_order, name`,
    ).all<{ id: number; name: string }>();
    return new Response(toCsv(tallyTemplateRows(services, months)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="paper-tally-template-${from}-to-${to}.csv"`,
      },
    });
  });

  route(app, "POST", "/api/imports/tally/preview", CART_ROLES, async (c) => {
    const parsed = tallyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const t = await analyzeTally(c, parsed.data.text);
    if ("error" in t) return c.json(t, 400);
    return c.json({
      records: t.result.records.length,
      months: t.result.months,
      rowErrors: t.result.rowErrors,
      warnings: t.result.warnings.slice(0, 200),
      warningCount: t.result.warnings.length,
      duplicateOfBatch: await activeBatchWithHash(c.env.DB, await sha256(parsed.data.text)),
      overlap: await existingDataInMonths(c.env.DB, t.result.months),
    });
  });

  route(app, "POST", "/api/imports/tally/commit", CART_ROLES, async (c) => {
    const staff = c.get("staff");
    const parsed = tallyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const body = parsed.data;
    const t = await analyzeTally(c, body.text);
    if ("error" in t) return c.json(t, 400);
    if (t.result.rowErrors.length > 0) return c.json({ error: "row_errors", rowErrors: t.result.rowErrors }, 409);
    if (t.result.records.length === 0) return c.json({ error: "no_rows" }, 400);
    if (t.result.warnings.length > 0 && !body.allowWarnings) {
      return c.json({ error: "has_warnings", warningCount: t.result.warnings.length }, 409);
    }
    const replace = await replacementCheck(c.env.DB, body.replaceBatchId ?? null, "paper_tally");
    if (replace) return c.json(replace, 409);

    const now = new Date().toISOString();
    const records = t.result.records.map((r) => ({ s: r.service_id, m: r.month, q: r.question, o: r.option, c: r.count }));
    const statements = [
      ...batchHeader(c.env.DB, {
        kind: "paper_tally",
        fileName: body.fileName,
        hash: await sha256(body.text),
        from: t.result.months[0] ?? null,
        to: t.result.months[t.result.months.length - 1] ?? null,
        imported: records.length,
        rejected: 0,
        by: staff.email,
        at: now,
        replaceBatchId: body.replaceBatchId ?? null,
      }),
    ];
    for (let i = 0; i < records.length; i += CHUNK) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO legacy_tallies (import_batch_id, service_id, month, question, option, count)
           SELECT (SELECT max(id) FROM import_batches), json_extract(value, '$.s'), json_extract(value, '$.m'),
                  json_extract(value, '$.q'), json_extract(value, '$.o'), json_extract(value, '$.c')
             FROM json_each(?1)`,
        ).bind(JSON.stringify(records.slice(i, i + CHUNK))),
      );
    }
    statements.push(
      auditStatement(c.env.DB, {
        actor: staff.email,
        action: body.replaceBatchId ? "import.tally_replace" : "import.tally",
        detail: { file: body.fileName, records: records.length, replaced: body.replaceBatchId ?? null },
      }),
    );
    await c.env.DB.batch(statements);
    return c.json({ ok: true, records: records.length }, 201);
  });
}

async function analyzeTally(c: AdminContext, text: string) {
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (err) {
    return { error: "unreadable_csv" as const, message: (err as Error).message };
  }
  const { results } = await c.env.DB.prepare(`SELECT id FROM services`).all<{ id: number }>();
  return { result: parseTallyCsv(rows, new Set(results.map((r) => r.id))) };
}

/**
 * The first statements of an import: the new batch row, and — when replacing — retiring the
 * old batch and removing its rows, all inside the same transaction as the new rows.
 */
function batchHeader(
  db: D1Database,
  b: {
    kind: "online_csv" | "paper_tally";
    fileName: string;
    hash: string;
    from: string | null;
    to: string | null;
    imported: number;
    rejected: number;
    by: string;
    at: string;
    replaceBatchId: number | null;
  },
): D1PreparedStatement[] {
  const statements = [
    db
      .prepare(
        `INSERT INTO import_batches (id, kind, file_name, file_sha256, period_from, period_to, rows_imported, rows_rejected, imported_by, imported_at)
         VALUES ((SELECT coalesce(max(id), 0) + 1 FROM import_batches), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(b.kind, b.fileName, b.hash, b.from, b.to, b.imported, b.rejected, b.by, b.at),
  ];
  if (b.replaceBatchId !== null) {
    statements.push(
      db.prepare(`UPDATE import_batches SET replaced_by = (SELECT max(id) FROM import_batches) WHERE id = ?1`).bind(b.replaceBatchId),
      db.prepare(`DELETE FROM response_contacts WHERE response_id IN (SELECT id FROM responses WHERE import_batch_id = ?1)`).bind(
        b.replaceBatchId,
      ),
      db.prepare(`DELETE FROM responses WHERE import_batch_id = ?1 AND channel = 'import'`).bind(b.replaceBatchId),
      db.prepare(`DELETE FROM legacy_tallies WHERE import_batch_id = ?1`).bind(b.replaceBatchId),
    );
  }
  return statements;
}

async function replacementCheck(db: D1Database, batchId: number | null, kind: string) {
  if (batchId === null) return null;
  const row = await db.prepare(`SELECT kind, replaced_by FROM import_batches WHERE id = ?1`).bind(batchId).first<{
    kind: string;
    replaced_by: number | null;
  }>();
  if (!row) return { error: "replace_target_missing" };
  if (row.kind !== kind) return { error: "replace_target_wrong_kind" };
  if (row.replaced_by !== null) return { error: "replace_target_already_replaced" };
  return null;
}

/** What already exists for these months, so CART can check the new file does not count the same forms twice. */
async function existingDataInMonths(db: D1Database, months: readonly string[]) {
  if (months.length === 0) return { responses: 0, tallyBatches: 0 };
  const { firstDay, lastDay } = monthBounds(months[0]!, months[months.length - 1]!);
  const [responses, tallies] = await db.batch([
    db.prepare(`SELECT count(*) AS n FROM responses WHERE transaction_date BETWEEN ?1 AND ?2 AND excluded_at IS NULL`).bind(firstDay, lastDay),
    db
      .prepare(
        `SELECT count(DISTINCT lt.import_batch_id) AS n FROM legacy_tallies lt JOIN import_batches b ON b.id = lt.import_batch_id
          WHERE b.replaced_by IS NULL AND lt.month BETWEEN ?1 AND ?2`,
      )
      .bind(months[0], months[months.length - 1]),
  ]);
  const n = (r: D1Result | undefined) => ((r?.results?.[0] as { n?: number } | undefined)?.n ?? 0);
  return { responses: n(responses), tallyBatches: n(tallies) };
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

import {
  csvCells,
  detailRows,
  isIsoMonth,
  isPsaExpired,
  getInstrument,
  manilaDate,
  summaryRows,
  toCsv,
  toXlsx,
  XLSX_CONTENT_TYPE,
  type CsmReport,
} from "@feedback/shared";
import type { Hono } from "hono";
import { auditStatement } from "../audit";
import type { AdminHono } from "../env";
import { loadReport, scopeFor } from "../report-data";
import { ALL_ROLES, route, type AdminContext } from "../routes";

function periodFrom(c: AdminContext): { from: string; to: string } | null {
  const month = manilaDate().slice(0, 7);
  const from = c.req.query("from") ?? `${month.slice(0, 4)}-01`;
  const to = c.req.query("to") ?? month;
  if (!isIsoMonth(from) || !isIsoMonth(to) || from > to) return null;
  return { from, to };
}

function divisionParam(c: AdminContext): number | null {
  const raw = c.req.query("division");
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A short view of a report for dashboard cards. */
function summary(report: CsmReport) {
  return {
    respondents: report.office.respondents,
    transactions: report.office.transactions,
    responseRate: report.office.responseRate,
    overall: report.office.overall.hundredths,
    rating: report.office.rating,
    sqd0: report.office.sqd.sqd0.score.hundredths,
    ccAwareness: report.office.ccSummary.awareness.hundredths,
    channel: report.demographics.channel,
    officeExcludesHiddenServices: report.officeExcludesHiddenServices,
    byService: report.services.map((s) => ({
      id: s.service.id,
      name: s.service.name,
      divisionCode: s.service.divisionCode,
      respondents: s.respondents,
      overall: s.overall.hundredths,
      rating: s.rating,
      suppressed: s.suppressed,
    })),
  };
}

export function reportRoutes(app: Hono<AdminHono>) {
  route(app, "GET", "/api/dashboard", ALL_ROLES, async (c) => {
    const staff = c.get("staff");
    const today = manilaDate();
    const month = today.slice(0, 7);
    const scope = scopeFor(staff, divisionParam(c));
    const [thisMonth, yearToDate] = await Promise.all([
      loadReport(c.env.DB, month, month, scope),
      loadReport(c.env.DB, `${month.slice(0, 4)}-01`, month, scope),
    ]);

    const [instruments, placeholders, unreleased, bursts] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT code FROM instrument_versions WHERE status = 'active'`),
      c.env.DB.prepare(`SELECT count(*) AS n FROM services WHERE active = 1 AND is_placeholder = 1`),
      c.env.DB.prepare(
        `SELECT count(*) AS n FROM responses WHERE suggestion IS NOT NULL AND comment_visibility = 'cart_only' AND excluded_at IS NULL`,
      ),
      c.env.DB.prepare(`SELECT count(*) AS n FROM responses WHERE suspect_burst = 1 AND excluded_at IS NULL AND transaction_date >= ?1`).bind(
        `${month}-01`,
      ),
    ]);
    const count = (r: D1Result | undefined) => ((r?.results?.[0] as { n?: number } | undefined)?.n ?? 0);
    const expired = ((instruments?.results ?? []) as { code: string }[])
      .map((row) => getInstrument(row.code))
      .filter((inst) => inst && isPsaExpired(inst, today))
      .map((inst) => ({ code: inst!.code, psaApprovalNo: inst!.psaApprovalNo, psaExpiry: inst!.psaExpiry }));
    const seesAll = staff.role !== "division_focal";

    return c.json({
      today,
      thisMonth: summary(thisMonth),
      yearToDate: summary(yearToDate),
      alerts: {
        expiredInstruments: expired,
        placeholderServices: seesAll ? count(placeholders) : 0,
        unreleasedComments: seesAll ? count(unreleased) : 0,
        suspectBursts: seesAll ? count(bursts) : 0,
      },
    });
  });

  route(app, "GET", "/api/reports/csm", ALL_ROLES, async (c) => {
    const period = periodFrom(c);
    if (!period) return c.json({ error: "invalid_period" }, 400);
    const report = await loadReport(c.env.DB, period.from, period.to, scopeFor(c.get("staff"), divisionParam(c)));
    return c.json(report);
  });

  route(app, "GET", "/api/reports/csm.csv", ALL_ROLES, async (c) => {
    const period = periodFrom(c);
    if (!period) return c.json({ error: "invalid_period" }, 400);
    const staff = c.get("staff");
    const report = await loadReport(c.env.DB, period.from, period.to, scopeFor(staff, divisionParam(c)));
    const detail = c.req.query("kind") === "detail";
    const rows = csvCells(detail ? detailRows(report) : summaryRows(report));
    await auditStatement(c.env.DB, {
      actor: staff.email,
      action: detail ? "export.csm_detail_csv" : "export.csm_summary_csv",
      detail: { from: period.from, to: period.to },
    }).run();
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="csm-${detail ? "detail" : "summary"}-${period.from}-to-${period.to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });

  // The same report as the CSVs, both tables in one workbook, with real percentages.
  route(app, "GET", "/api/reports/csm.xlsx", ALL_ROLES, async (c) => {
    const period = periodFrom(c);
    if (!period) return c.json({ error: "invalid_period" }, 400);
    const staff = c.get("staff");
    const report = await loadReport(c.env.DB, period.from, period.to, scopeFor(staff, divisionParam(c)));
    const workbook = toXlsx([
      { name: "Summary", rows: summaryRows(report) },
      { name: "SQD detail", rows: detailRows(report) },
    ]);
    await auditStatement(c.env.DB, {
      actor: staff.email,
      action: "export.csm_xlsx",
      detail: { from: period.from, to: period.to },
    }).run();
    return new Response(workbook, {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="csm-${period.from}-to-${period.to}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  });
}

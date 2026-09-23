import {
  buildReport,
  MIN_GROUP_SIZE,
  suppressSmallGroups,
  type CsmReport,
  type LegacyTallyRow,
  type ReportResponseRow,
  type ReportService,
  type TransactionCountRow,
} from "@feedback/shared";
import type { Staff } from "./env";

/** First and last day of a month range, e.g. 2026-01..2026-12 → 2026-01-01..2026-12-31. */
export function monthBounds(from: string, to: string): { firstDay: string; lastDay: string } {
  const [year, month] = to.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { firstDay: `${from}-01`, lastDay: `${to}-${String(last).padStart(2, "0")}` };
}

export interface ReportScope {
  divisionId: number | null;
  suppress: boolean;
}

/** A division focal person always sees their own division, with small groups hidden. */
export function scopeFor(staff: Staff, requestedDivision: number | null): ReportScope {
  if (staff.role === "division_focal") return { divisionId: staff.divisionId, suppress: true };
  return { divisionId: requestedDivision, suppress: false };
}

/** Everything the report needs, read in one batch so the numbers come from one consistent snapshot. */
export async function loadReport(db: D1Database, from: string, to: string, scope: ReportScope): Promise<CsmReport> {
  const { firstDay, lastDay } = monthBounds(from, to);
  const [services, responses, legacy, transactions] = await db.batch([
    db
      .prepare(
        `SELECT s.id, s.name, s.division_id AS divisionId, d.code AS divisionCode,
                s.is_external AS isExternal, s.is_placeholder AS isPlaceholder
           FROM services s JOIN divisions d ON d.id = s.division_id
          WHERE (?1 IS NULL OR s.division_id = ?1)
          ORDER BY d.code, s.sort_order, s.name`,
      )
      .bind(scope.divisionId),
    db
      .prepare(
        `SELECT r.service_id, r.channel, r.client_type, r.sex, r.age, r.region, r.cc1, r.cc2, r.cc3,
                r.sqd0, r.sqd1, r.sqd2, r.sqd3, r.sqd4, r.sqd5, r.sqd6, r.sqd7, r.sqd8
           FROM responses r JOIN services s ON s.id = r.service_id
          WHERE r.transaction_date BETWEEN ?1 AND ?2 AND (?3 IS NULL OR s.division_id = ?3)`,
      )
      .bind(firstDay, lastDay, scope.divisionId),
    db
      .prepare(
        `SELECT lt.service_id, lt.question, lt.option, sum(lt.count) AS count
           FROM legacy_tallies lt
           JOIN import_batches b ON b.id = lt.import_batch_id
           JOIN services s ON s.id = lt.service_id
          WHERE b.replaced_by IS NULL AND lt.month BETWEEN ?1 AND ?2 AND (?3 IS NULL OR s.division_id = ?3)
          GROUP BY lt.service_id, lt.question, lt.option`,
      )
      .bind(from, to, scope.divisionId),
    db
      .prepare(
        `SELECT t.service_id, sum(t.count) AS count
           FROM transaction_counts t JOIN services s ON s.id = t.service_id
          WHERE t.month BETWEEN ?1 AND ?2 AND (?3 IS NULL OR s.division_id = ?3)
          GROUP BY t.service_id`,
      )
      .bind(from, to, scope.divisionId),
  ]);

  const serviceRows = (services?.results ?? []) as (Omit<ReportService, "isExternal" | "isPlaceholder"> & {
    isExternal: number;
    isPlaceholder: number;
  })[];
  const report = buildReport({
    period: { from, to },
    services: serviceRows.map((s) => ({ ...s, isExternal: s.isExternal === 1, isPlaceholder: s.isPlaceholder === 1 })),
    responses: (responses?.results ?? []) as unknown as ReportResponseRow[],
    legacy: (legacy?.results ?? []) as unknown as LegacyTallyRow[],
    transactions: (transactions?.results ?? []) as unknown as TransactionCountRow[],
  });
  return scope.suppress ? suppressSmallGroups(report, MIN_GROUP_SIZE) : report;
}

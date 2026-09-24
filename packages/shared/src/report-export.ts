// The ARTA report as rows, shared by the CSV and Excel exports so both always carry the same
// numbers. Percentages are PercentCell (hundredths): the CSV writes them as text ("96.07%"),
// the workbook as real percentages.

import { SQD_CODES } from "./constants";
import type { CsmReport } from "./report";
import { formatPercent } from "./scoring";
import { isPercentCell, type Cell } from "./xlsx";

const pct = (hundredths: number | null): Cell => ({ percent: hundredths });

export function summaryRows(report: CsmReport): Cell[][] {
  const header: Cell[] = [
    "Division",
    "Service",
    "Respondents",
    "Transactions",
    "Response rate",
    ...SQD_CODES.map((c) => c.toUpperCase()),
    "Overall (SQD1-8)",
    "Rating",
    "CC awareness",
    "CC visibility",
    "CC helpfulness",
  ];
  const line = (division: string, name: string, t: CsmReport["office"] | CsmReport["services"][number]): Cell[] => [
    division,
    name,
    t.respondents,
    t.transactions ?? null,
    pct(t.responseRate),
    ...SQD_CODES.map((code) => pct(t.sqd[code].score.hundredths)),
    pct(t.overall.hundredths),
    t.rating ?? null,
    pct(t.ccSummary.awareness.hundredths),
    pct(t.ccSummary.visibility.hundredths),
    pct(t.ccSummary.helpfulness.hundredths),
  ];
  return [
    header,
    ...report.services.map((s) =>
      s.suppressed ? [s.service.divisionCode, s.service.name, "fewer than 5"] : line(s.service.divisionCode, s.service.name, s),
    ),
    line("", "All services", report.office),
  ];
}

export function detailRows(report: CsmReport): Cell[][] {
  const rows: Cell[][] = [["Division", "Service", "Item", "SD", "D", "N", "A", "SA", "N/A", "Blank", "Score"]];
  for (const s of report.services) {
    if (s.suppressed) continue;
    for (const code of SQD_CODES) {
      const { counts, score } = s.sqd[code];
      rows.push([
        s.service.divisionCode,
        s.service.name,
        code.toUpperCase(),
        counts.sd,
        counts.d,
        counts.n,
        counts.a,
        counts.sa,
        counts.na,
        counts.blank,
        pct(score.hundredths),
      ]);
    }
  }
  return rows;
}

/** The same rows for the CSV: percentages as text, exactly as the report page shows them. */
export function csvCells(rows: readonly (readonly Cell[])[]): unknown[][] {
  return rows.map((row) => row.map((cell) => (isPercentCell(cell) ? formatPercent(cell.percent) : cell)));
}

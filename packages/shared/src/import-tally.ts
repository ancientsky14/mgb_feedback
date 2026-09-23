// Paper tally sheets from before go-live, in a template the admin side generates: one row per
// service per month, one column per answer option. Blank cells count as zero.

import { SQD_CODES } from "./constants";
import { isIsoMonth } from "./time";

const CC_COLUMNS = [
  ...[1, 2, 3, 4].map((o) => `cc1_${o}`),
  "cc1_blank",
  ...[1, 2, 3, 4, 5].map((o) => `cc2_${o}`),
  "cc2_blank",
  ...[1, 2, 3, 4].map((o) => `cc3_${o}`),
  "cc3_blank",
];

const SQD_SUFFIXES = [
  ["sd", 1],
  ["d", 2],
  ["n", 3],
  ["a", 4],
  ["sa", 5],
  ["na", 0],
  ["blank", -1],
] as const;

const SQD_COLUMNS = SQD_CODES.flatMap((code) => SQD_SUFFIXES.map(([suffix]) => `${code}_${suffix}`));

export const TALLY_COLUMNS = ["month", "service_id", "service_name", "respondents", ...CC_COLUMNS, ...SQD_COLUMNS] as const;

export interface TallyRecord {
  service_id: number;
  month: string;
  question: string;
  option: number;
  count: number;
}

/** What each count column means: question and option (-1 = blank). */
function columnMeaning(column: string): { question: string; option: number } | null {
  if (column === "respondents") return { question: "respondents", option: -1 };
  const cc = /^(cc[123])_(\d|blank)$/.exec(column);
  if (cc?.[1] && cc[2]) return { question: cc[1], option: cc[2] === "blank" ? -1 : Number(cc[2]) };
  const sqd = /^(sqd[0-8])_([a-z]+)$/.exec(column);
  if (sqd?.[1] && sqd[2]) {
    const found = SQD_SUFFIXES.find(([suffix]) => suffix === sqd[2]);
    if (found) return { question: sqd[1], option: found[1] };
  }
  return null;
}

export interface TallyParseResult {
  records: TallyRecord[];
  rowErrors: { row: number; errors: string[] }[];
  warnings: string[];
  months: string[];
}

/** rows[0] is the header. Row numbers in messages are spreadsheet rows (the header is row 1). */
export function parseTallyCsv(rows: readonly (readonly string[])[], serviceIds: ReadonlySet<number>): TallyParseResult {
  const result: TallyParseResult = { records: [], rowErrors: [], warnings: [], months: [] };
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = TALLY_COLUMNS.filter((c) => c !== "service_name" && !header.includes(c));
  if (missing.length > 0) {
    result.rowErrors.push({ row: 1, errors: [`Missing columns: ${missing.join(", ")}. Use the template from the Imports page.`] });
    return result;
  }
  const seen = new Set<string>();
  const months = new Set<string>();

  rows.slice(1).forEach((cells, i) => {
    const rowNumber = i + 2;
    const errors: string[] = [];
    const value = (column: string) => (cells[header.indexOf(column)] ?? "").trim();

    const month = value("month");
    if (!isIsoMonth(month)) errors.push(`Month "${month}" must be YYYY-MM`);
    const serviceId = Number(value("service_id"));
    if (!Number.isInteger(serviceId) || !serviceIds.has(serviceId)) errors.push(`Unknown service_id "${value("service_id")}"`);
    const key = `${month}|${serviceId}`;
    if (seen.has(key)) errors.push(`Service ${serviceId} appears twice for ${month}`);

    const counts = new Map<string, number>();
    for (const column of header) {
      const meaning = columnMeaning(column);
      if (!meaning) continue;
      const raw = value(column);
      const n = raw === "" ? 0 : Number(raw);
      if (!Number.isSafeInteger(n) || n < 0) {
        errors.push(`${column} must be a whole number, got "${raw}"`);
        continue;
      }
      counts.set(column, n);
    }

    if (errors.length > 0) {
      result.rowErrors.push({ row: rowNumber, errors });
      return;
    }
    seen.add(key);
    months.add(month);

    const respondents = counts.get("respondents") ?? 0;
    const questions = ["cc1", "cc2", "cc3", ...SQD_CODES];
    for (const q of questions) {
      const total = [...counts].filter(([c]) => c.startsWith(`${q}_`)).reduce((sum, [, n]) => sum + n, 0);
      if (total !== respondents) {
        result.warnings.push(`Row ${rowNumber}: ${q.toUpperCase()} answers add up to ${total}, respondents is ${respondents}`);
      }
    }
    for (const [column, count] of counts) {
      const meaning = columnMeaning(column);
      if (meaning && count > 0) result.records.push({ service_id: serviceId, month, ...meaning, count });
    }
  });

  result.months = [...months].sort();
  return result;
}

/** A blank template: one row per service for each month, with the service name for reference. */
export function tallyTemplateRows(services: readonly { id: number; name: string }[], months: readonly string[]): string[][] {
  const header = [...TALLY_COLUMNS];
  const blanks = header.slice(4).map(() => "");
  return [header, ...months.flatMap((month) => services.map((s) => [month, String(s.id), s.name, "", ...blanks]))];
}

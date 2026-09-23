// Maps a CSV export of the office's current online CSM form (e.g. Google Forms) onto the ARTA
// instrument. Columns are found by the ARTA item codes in their headers (CC1, SQD4, …) and
// answers by ARTA's own wording, so nothing depends on guessing the office's exact layout.
// The real export is a Phase 0 input: tune HEADER_RULES against it, then pin it in a test.
//
// Email columns are deliberately not imported: the report does not need them.

import { SQD_CODES, type ClientType, type Sex, type SqdCode } from "./constants";
import type { InstrumentDefinition } from "./instrument";
import { REGIONS, type RegionCode } from "./regions";
import { isIsoDate } from "./time";

export const IMPORT_FIELDS = [
  "transactionDate",
  "service",
  "clientType",
  "sex",
  "age",
  "region",
  "cc1",
  "cc2",
  "cc3",
  ...SQD_CODES,
  "suggestion",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = ["transactionDate", "service", "cc1", "cc2", "cc3", ...SQD_CODES];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

// Order matters: an SQD header ("SQD0. I am satisfied with the service…") contains words
// other rules look for, so item codes are matched first and each header is used once.
const HEADER_RULES: readonly (readonly [ImportField, RegExp])[] = [
  ["cc1", /\bcc ?1\b/],
  ["cc2", /\bcc ?2\b/],
  ["cc3", /\bcc ?3\b/],
  ...SQD_CODES.map((code, i) => [code, new RegExp(`\\bsqd ?${i}\\b`)] as const),
  ["clientType", /\bclient ?type\b/],
  ["service", /\bservice/],
  ["sex", /\b(sex|gender)\b/],
  ["age", /\bage\b/],
  ["region", /\bregion\b/],
  ["suggestion", /suggestion/],
  ["transactionDate", /\bdate\b/],
];

export interface ColumnDetection {
  columns: Partial<Record<ImportField, number>>;
  ignored: string[];
  missing: ImportField[];
}

export function detectColumns(headers: readonly string[]): ColumnDetection {
  const columns: Partial<Record<ImportField, number>> = {};
  const used = new Set<number>();
  for (const [field, pattern] of HEADER_RULES) {
    const index = headers.findIndex((h, i) => !used.has(i) && pattern.test(norm(h)));
    if (index >= 0) {
      columns[field] = index;
      used.add(index);
    }
  }
  // A form without a "date" question still carries the submission timestamp.
  if (columns.transactionDate === undefined) {
    const index = headers.findIndex((h, i) => !used.has(i) && /\btimestamp\b/.test(norm(h)));
    if (index >= 0) {
      columns.transactionDate = index;
      used.add(index);
    }
  }
  return {
    columns,
    ignored: headers.filter((_, i) => !used.has(i)),
    missing: REQUIRED_IMPORT_FIELDS.filter((f) => columns[f] === undefined),
  };
}

export type DateOrder = "mdy" | "dmy";

/** YYYY-MM-DD, or a spreadsheet date like 9/23/2026 (optionally with a time) in the given order. */
export function parseImportDate(value: string, order: DateOrder): string | null {
  const v = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(v);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isIsoDate(date) ? date : null;
  }
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/.exec(v);
  if (!slash) return null;
  const [a, b, year] = [slash[1], slash[2], slash[3]];
  const [month, day] = order === "mdy" ? [a, b] : [b, a];
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isIsoDate(date) ? date : null;
}

const LIKERT_LABELS: Record<string, number> = {
  "strongly agree": 5,
  agree: 4,
  "neither agree nor disagree": 3,
  neither: 3,
  neutral: 3,
  disagree: 2,
  "strongly disagree": 1,
  "n/a": 0,
  na: 0,
  "not applicable": 0,
  "n/a not applicable": 0,
};

/** An SQD answer: 1–5, 0 for N/A, null for blank, undefined when unreadable. */
export function parseLikert(value: string): number | null | undefined {
  const v = norm(value);
  if (v === "") return null;
  if (/^[0-5]$/.test(v)) return Number(v);
  return LIKERT_LABELS[v];
}

const CC_NA: Record<"cc1" | "cc2" | "cc3", number | undefined> = { cc1: undefined, cc2: 5, cc3: 4 };

/** A CC answer by its number ("1", "1.", "1 - …") or by ARTA's option wording; null blank, undefined unreadable. */
export function parseCcAnswer(value: string, question: "cc1" | "cc2" | "cc3", instrument: InstrumentDefinition): number | null | undefined {
  const v = norm(value);
  if (v === "") return null;
  const q = instrument.cc.find((c) => c.code === question);
  if (!q) return undefined;
  const lead = /^(\d)(?:[.)\s-]|$)/.exec(v);
  if (lead) {
    const n = Number(lead[1]);
    return q.options.some((o) => o.code === n) ? n : undefined;
  }
  if (v === "n/a" || v === "na" || v === "not applicable") return CC_NA[question];
  const byLabel = q.options.find((o) => norm(o.label.en).replace(/\s*\(answer.*\)$/, "").replace(/\.$/, "") === v.replace(/\.$/, ""));
  return byLabel?.code;
}

export function parseClientType(value: string): ClientType | null | undefined {
  const v = norm(value);
  if (v === "") return null;
  if (v === "citizen") return "citizen";
  if (v === "business") return "business";
  if (v.startsWith("government")) return "government";
  return undefined;
}

export function parseSex(value: string): Sex | null | undefined {
  const v = norm(value);
  if (v === "" || v.startsWith("prefer not")) return null;
  if (v === "male" || v === "m") return "male";
  if (v === "female" || v === "f") return "female";
  return undefined;
}

const ROMAN: Record<string, string> = { i: "01", ii: "02", iii: "03", v: "05", vi: "06", vii: "07", viii: "08", ix: "09", x: "10", xi: "11", xii: "12", xiii: "13" };

// Exact aliases only — a loose "contains" match would send a word like "region" to the wrong place.
const REGION_ALIASES = new Map<string, RegionCode>();
for (const r of REGIONS) {
  const name = norm(r.name);
  REGION_ALIASES.set(r.code.toLowerCase(), r.code);
  REGION_ALIASES.set(name, r.code);
  const afterDash = name.split(" – ")[1];
  if (afterDash) REGION_ALIASES.set(afterDash, r.code);
  const inParens = /\(([^)]+)\)/.exec(name)?.[1];
  if (inParens) REGION_ALIASES.set(inParens, r.code);
  REGION_ALIASES.set(name.replace(/\s*\([^)]*\)/, ""), r.code);
}
for (const [alias, code] of [
  ["ilocos", "R01"],
  ["metro manila", "NCR"],
  ["cordillera", "CAR"],
  ["bicol", "R05"],
  ["davao", "R11"],
  ["mimaropa", "R4B"],
  ["bangsamoro", "BARMM"],
  ["abroad", "ABROAD"],
  ["overseas", "ABROAD"],
] as const) {
  REGION_ALIASES.set(alias, code);
}

export function parseRegion(value: string): RegionCode | null | undefined {
  const v = norm(value).replace(/\s+-\s+/g, " – ");
  if (v === "") return null;
  const alias = REGION_ALIASES.get(v);
  if (alias) return alias;
  const numbered = /^(?:region|r)\s*-?\s*(iv-?a|iv-?b|4-?a|4-?b|[ivx]+|\d{1,2})\b/.exec(v);
  if (numbered?.[1]) {
    const n = numbered[1].replace("-", "");
    if (n === "iva" || n === "4a") return "R4A";
    if (n === "ivb" || n === "4b") return "R4B";
    const two = ROMAN[n] ?? (/^\d{1,2}$/.test(n) ? n.padStart(2, "0") : undefined);
    const match = two ? REGIONS.find((r) => r.code === `R${two}`) : undefined;
    if (match) return match.code;
  }
  return undefined;
}

export interface ImportServiceLookup {
  id: number;
  name: string;
}

export interface ImportedRow {
  transactionDate: string;
  serviceId: number;
  clientType: ClientType | null;
  sex: Sex | null;
  age: number | null;
  region: RegionCode | null;
  cc1: number | null;
  cc2: number | null;
  cc3: number | null;
  sqd: Record<SqdCode, number | null>;
  suggestion: string | null;
}

export type RowResult = { ok: true; row: ImportedRow; warnings: string[] } | { ok: false; errors: string[] };

/**
 * One data row. Core answers (date, service, CC, SQD) that cannot be read reject the row; an
 * unreadable optional answer (client type, sex, age, region) is kept as blank with a warning.
 */
export function parseOnlineRow(
  cells: readonly string[],
  columns: Partial<Record<ImportField, number>>,
  context: { services: readonly ImportServiceLookup[]; instrument: InstrumentDefinition; dateOrder: DateOrder; today: string },
): RowResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cell = (field: ImportField) => {
    const index = columns[field];
    return index === undefined ? "" : (cells[index] ?? "");
  };

  const transactionDate = parseImportDate(cell("transactionDate"), context.dateOrder);
  if (!transactionDate) errors.push(`Unreadable date "${cell("transactionDate")}"`);
  else if (transactionDate > context.today) errors.push(`Date ${transactionDate} is in the future`);

  const serviceText = norm(cell("service"));
  const service =
    context.services.find((s) => norm(s.name) === serviceText) ??
    (/^\d+$/.test(serviceText) ? context.services.find((s) => s.id === Number(serviceText)) : undefined);
  if (!service) errors.push(`Unknown service "${cell("service")}"`);

  const optional = <T>(field: ImportField, parse: (v: string) => T | null | undefined): T | null => {
    const parsed = parse(cell(field));
    if (parsed === undefined) {
      warnings.push(`Unreadable ${field} "${cell(field)}" kept as blank`);
      return null;
    }
    return parsed;
  };
  const clientType = optional("clientType", parseClientType);
  const sex = optional("sex", parseSex);
  const region = optional("region", parseRegion);
  const age = optional("age", (v) => {
    if (v.trim() === "") return null;
    const n = Number(v.trim());
    return Number.isInteger(n) && n >= 1 && n <= 120 ? n : undefined;
  });

  const cc = (["cc1", "cc2", "cc3"] as const).map((q) => {
    const parsed = parseCcAnswer(cell(q), q, context.instrument);
    if (parsed === undefined) errors.push(`Unreadable ${q.toUpperCase()} "${cell(q)}"`);
    return parsed ?? null;
  });

  const sqd = {} as Record<SqdCode, number | null>;
  for (const code of SQD_CODES) {
    const parsed = parseLikert(cell(code));
    if (parsed === undefined) errors.push(`Unreadable ${code.toUpperCase()} "${cell(code)}"`);
    sqd[code] = parsed ?? null;
  }

  const suggestionText = cell("suggestion").trim();
  if (errors.length > 0 || !transactionDate || !service) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    row: {
      transactionDate,
      serviceId: service.id,
      clientType,
      sex,
      age,
      region,
      cc1: cc[0] ?? null,
      cc2: cc[1] ?? null,
      cc3: cc[2] ?? null,
      sqd,
      suggestion: suggestionText === "" ? null : suggestionText.slice(0, 2000),
    },
  };
}

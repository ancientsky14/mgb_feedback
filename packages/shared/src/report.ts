// Builds the ARTA CSM report tables from per-response rows, legacy paper tallies and
// transaction counts. Pure: the admin Worker only runs the queries and passes the rows in,
// so the dashboard, the annual report and the golden test all use this one implementation.

import { ageBracket, AGE_BRACKETS, type AgeBracketCode } from "./age";
import { CHANNELS, CLIENT_TYPES, SEXES, SQD_CODES, type Channel, type SqdCode } from "./constants";
import { REGIONS } from "./regions";
import {
  ccSummary,
  emptyCcCounts,
  emptyLikertCounts,
  meanOfScores,
  overallScore,
  ratingFor,
  responseRate,
  scoreLikert,
  sumCc,
  sumLikert,
  tallyCc,
  tallyLikert,
  type CcCounts,
  type CcSummary,
  type Hundredths,
  type LikertCounts,
  type Rating,
  type SqdScore,
} from "./scoring";

export interface ReportService {
  id: number;
  name: string;
  divisionId: number;
  divisionCode: string;
  isExternal: boolean;
  isPlaceholder: boolean;
}

/** One stored response, only the columns the report reads. */
export interface ReportResponseRow {
  service_id: number;
  channel: Channel;
  client_type: string | null;
  sex: string | null;
  age: number | null;
  region: string | null;
  cc1: number | null;
  cc2: number | null;
  cc3: number | null;
  sqd0: number | null;
  sqd1: number | null;
  sqd2: number | null;
  sqd3: number | null;
  sqd4: number | null;
  sqd5: number | null;
  sqd6: number | null;
  sqd7: number | null;
  sqd8: number | null;
}

/** A legacy tally count. option: SQD 0–5 (0 = N/A), CC 1–5, -1 = blank; 'respondents' uses -1. */
export interface LegacyTallyRow {
  service_id: number;
  question: string;
  option: number;
  count: number;
}

export interface TransactionCountRow {
  service_id: number;
  count: number;
}

export interface SqdResult {
  counts: LikertCounts;
  score: SqdScore;
}

export interface Totals {
  respondents: number;
  transactions: number | null;
  responseRate: Hundredths | null;
  sqd: Record<SqdCode, SqdResult>;
  overall: SqdScore;
  rating: Rating | null;
  cc: CcCounts;
  ccSummary: CcSummary;
}

export interface ServiceReport extends Totals {
  service: ReportService;
  /** True when the rows were withheld because the group is too small to stay anonymous. */
  suppressed: boolean;
}

export type Breakdown<K extends string> = Record<K, number | null>;

export interface CsmReport {
  period: { from: string; to: string };
  services: ServiceReport[];
  office: Totals & {
    /** Mean of the per-service overall scores — the other way agencies state the office score. */
    overallMeanOfServices: Hundredths | null;
  };
  /** True when small services were hidden and the office totals leave them out. */
  officeExcludesHiddenServices: boolean;
  /** Per-response data only; legacy tallies carry no demographics. Null = hidden (small group). */
  demographics: {
    clientType: Breakdown<(typeof CLIENT_TYPES)[number] | "unspecified">;
    sex: Breakdown<(typeof SEXES)[number] | "unspecified">;
    ageBracket: Breakdown<AgeBracketCode>;
    region: Breakdown<string>;
    channel: Breakdown<Channel>;
  };
  includesLegacyTallies: boolean;
}

interface Accumulator {
  respondents: number;
  sqd: Record<SqdCode, LikertCounts>;
  cc: CcCounts;
}

function emptyAccumulator(): Accumulator {
  return {
    respondents: 0,
    sqd: Object.fromEntries(SQD_CODES.map((c) => [c, emptyLikertCounts()])) as Record<SqdCode, LikertCounts>,
    cc: emptyCcCounts(),
  };
}

function addLegacy(acc: Accumulator, row: LegacyTallyRow): void {
  if (!Number.isSafeInteger(row.count) || row.count < 0) throw new RangeError(`Bad tally count: ${row.count}`);
  if (row.question === "respondents") {
    acc.respondents += row.count;
    return;
  }
  if ((SQD_CODES as readonly string[]).includes(row.question)) {
    const counts = acc.sqd[row.question as SqdCode];
    const key = ({ [-1]: "blank", 0: "na", 1: "sd", 2: "d", 3: "n", 4: "a", 5: "sa" } as Record<number, keyof LikertCounts>)[row.option];
    if (!key) throw new RangeError(`Bad ${row.question} option: ${row.option}`);
    counts[key] += row.count;
    return;
  }
  if (row.question === "cc1" || row.question === "cc2" || row.question === "cc3") {
    const bucket = acc.cc[row.question];
    const index = row.option === -1 ? 0 : row.option;
    if (!Number.isInteger(index) || index < 0 || index >= bucket.length) {
      throw new RangeError(`Bad ${row.question} option: ${row.option}`);
    }
    bucket[index] = (bucket[index] ?? 0) + row.count;
    return;
  }
  throw new RangeError(`Unknown tally question: ${row.question}`);
}

function totalsFrom(acc: Accumulator, transactions: number | null): Totals {
  const sqd = Object.fromEntries(
    SQD_CODES.map((code) => [code, { counts: acc.sqd[code], score: scoreLikert(acc.sqd[code]) }]),
  ) as Record<SqdCode, SqdResult>;
  const overall = overallScore(acc.sqd);
  return {
    respondents: acc.respondents,
    transactions,
    responseRate: transactions === null ? null : responseRate(acc.respondents, transactions),
    sqd,
    overall,
    rating: overall.hundredths === null ? null : ratingFor(overall.hundredths),
    cc: acc.cc,
    ccSummary: ccSummary(acc.cc),
  };
}

export function buildReport(input: {
  period: { from: string; to: string };
  services: readonly ReportService[];
  responses: readonly ReportResponseRow[];
  legacy: readonly LegacyTallyRow[];
  transactions: readonly TransactionCountRow[];
}): CsmReport {
  const byService = new Map<number, Accumulator>();
  const acc = (serviceId: number) => {
    let a = byService.get(serviceId);
    if (!a) byService.set(serviceId, (a = emptyAccumulator()));
    return a;
  };

  const clientType = zeroes([...CLIENT_TYPES, "unspecified"] as const);
  const sex = zeroes([...SEXES, "unspecified"] as const);
  const age = zeroes(AGE_BRACKETS.map((b) => b.code));
  const region = zeroes([...REGIONS.map((r) => r.code), "unspecified"]);
  const channel = zeroes(CHANNELS);

  for (const r of input.responses) {
    const a = acc(r.service_id);
    a.respondents++;
    for (const code of SQD_CODES) tallyLikert(a.sqd[code], r[code]);
    tallyCc(a.cc, r.cc1, r.cc2, r.cc3);
    bump(clientType, r.client_type ?? "unspecified");
    bump(sex, r.sex ?? "unspecified");
    bump(age, ageBracket(r.age));
    bump(region, r.region ?? "unspecified");
    bump(channel, r.channel);
  }
  for (const row of input.legacy) addLegacy(acc(row.service_id), row);

  const transactions = new Map<number, number>();
  for (const t of input.transactions) transactions.set(t.service_id, (transactions.get(t.service_id) ?? 0) + t.count);

  const services: ServiceReport[] = [];
  for (const service of input.services) {
    const a = byService.get(service.id);
    const tx = transactions.get(service.id) ?? null;
    if (!a && tx === null) continue; // nothing to report for this service in the period
    services.push({ service, suppressed: false, ...totalsFrom(a ?? emptyAccumulator(), tx) });
  }

  return {
    period: input.period,
    services,
    office: officeTotals(services),
    officeExcludesHiddenServices: false,
    demographics: { clientType, sex, ageBracket: age, region, channel },
    includesLegacyTallies: input.legacy.length > 0,
  };
}

/** Office totals: every column summed over the given services, then scored like any row. */
function officeTotals(services: readonly ServiceReport[]): CsmReport["office"] {
  const office = emptyAccumulator();
  for (const s of services) {
    office.respondents += s.respondents;
    for (const code of SQD_CODES) office.sqd[code] = sumLikert([office.sqd[code], s.sqd[code].counts]);
    office.cc = sumCc([office.cc, s.cc]);
  }
  const transactions = services.some((s) => s.transactions !== null)
    ? services.reduce((sum, s) => sum + (s.transactions ?? 0), 0)
    : null;
  return { ...totalsFrom(office, transactions), overallMeanOfServices: meanOfScores(services.map((s) => s.overall)) };
}

function zeroes<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

/**
 * For division focal persons, so a small group cannot be traced to the people in it:
 *   - a service with fewer than `min` respondents shows no counts or scores;
 *   - office totals leave hidden services out (otherwise subtracting the visible services
 *     from the total would give the hidden one back);
 *   - a demographic breakdown with any group under `min` is hidden whole (hiding just the
 *     small group would leave it recoverable from the total).
 * CART, admins and management see the full report.
 */
export function suppressSmallGroups(report: CsmReport, min: number): CsmReport {
  const services = report.services.map((s): ServiceReport =>
    s.respondents >= min ? s : { ...s, ...totalsFrom(emptyAccumulator(), s.transactions), respondents: 0, suppressed: true },
  );
  const visible = services.filter((s) => !s.suppressed);
  let office = officeTotals(visible);
  if (office.respondents > 0 && office.respondents < min) {
    office = { ...totalsFrom(emptyAccumulator(), office.transactions), respondents: 0, overallMeanOfServices: null };
  }
  const hide = <K extends string>(b: Breakdown<K>): Breakdown<K> => {
    const small = Object.values<number | null>(b).some((v) => v !== null && v > 0 && v < min);
    return small ? (Object.fromEntries(Object.keys(b).map((k) => [k, null])) as Breakdown<K>) : b;
  };
  return {
    ...report,
    services,
    office,
    officeExcludesHiddenServices: services.some((s) => s.suppressed),
    demographics: {
      clientType: hide(report.demographics.clientType),
      sex: hide(report.demographics.sex),
      ageBracket: hide(report.demographics.ageBracket),
      region: hide(report.demographics.region),
      channel: hide(report.demographics.channel),
    },
  };
}

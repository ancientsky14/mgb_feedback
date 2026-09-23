// ARTA CSM scoring (MC 2022-05 as amended by MC 2023-05), matched against the worked
// tables of a filed agency report (PRA FY2025 CSM Report) — see scoring.test.ts.
//
//   score   = (Strongly Agree + Agree) ÷ (responses − N/A)
//   overall = the same formula over SQD1–SQD8 pooled (column sums); SQD0 is reported alone
//   bands   = applied to the score as reported, i.e. rounded to two decimals
//
// Percentages are integer hundredths (9607 = 96.07%) rounded half up with exact integer
// arithmetic, so a score never lands in the wrong band through floating-point error.

import { OVERALL_SQD_CODES, type SqdCode } from "./constants";

export type Hundredths = number;

/** Counts of one SQD item's answers. `blank` = left empty on a paper form; not a response. */
export interface LikertCounts {
  sd: number;
  d: number;
  n: number;
  a: number;
  sa: number;
  na: number;
  blank: number;
}

export function emptyLikertCounts(): LikertCounts {
  return { sd: 0, d: 0, n: 0, a: 0, sa: 0, na: 0, blank: 0 };
}

/** Adds one stored SQD value (1–5, 0 = N/A, null = blank) to the counts. */
export function tallyLikert(counts: LikertCounts, value: number | null | undefined): void {
  switch (value) {
    case 1:
      counts.sd++;
      break;
    case 2:
      counts.d++;
      break;
    case 3:
      counts.n++;
      break;
    case 4:
      counts.a++;
      break;
    case 5:
      counts.sa++;
      break;
    case 0:
      counts.na++;
      break;
    case null:
    case undefined:
      counts.blank++;
      break;
    default:
      throw new RangeError(`Not a stored SQD value: ${String(value)}`);
  }
}

export function sumLikert(list: readonly LikertCounts[]): LikertCounts {
  const total = emptyLikertCounts();
  for (const c of list) {
    total.sd += c.sd;
    total.d += c.d;
    total.n += c.n;
    total.a += c.a;
    total.sa += c.sa;
    total.na += c.na;
    total.blank += c.blank;
  }
  return total;
}

/** numerator ÷ denominator as a percentage in hundredths, rounded half up; null when there is nothing to divide by. */
export function percentHundredths(numerator: number, denominator: number): Hundredths | null {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator < 0 || denominator < 0) {
    throw new RangeError(`Counts must be non-negative integers: ${numerator}/${denominator}`);
  }
  if (denominator === 0) return null;
  return Math.floor((numerator * 20000 + denominator) / (2 * denominator));
}

export interface Ratio {
  numerator: number;
  denominator: number;
  hundredths: Hundredths | null;
}

export interface SqdScore extends Ratio {
  /** Answers that were not blank, N/A included. */
  answered: number;
  na: number;
}

export function scoreLikert(c: LikertCounts): SqdScore {
  const answered = c.sd + c.d + c.n + c.a + c.sa + c.na;
  const denominator = answered - c.na;
  const numerator = c.a + c.sa;
  return { numerator, denominator, answered, na: c.na, hundredths: percentHundredths(numerator, denominator) };
}

/** The "Overall" row of a service's SQD table: SQD1–SQD8 pooled, then the same formula. */
export function overallScore(bySqd: Readonly<Record<SqdCode, LikertCounts>>): SqdScore {
  return scoreLikert(sumLikert(OVERALL_SQD_CODES.map((code) => bySqd[code])));
}

/**
 * Exact mean of several scores (for example, the office-wide average of per-service overall
 * scores), rounded half up. Scores with nothing to divide by are left out.
 */
export function meanOfScores(scores: readonly Ratio[]): Hundredths | null {
  const valid = scores.filter((s) => s.denominator > 0);
  if (valid.length === 0) return null;
  // Σ(nᵢ/dᵢ)/k as one fraction over the common denominator, in BigInt so nothing is lost.
  let commonDen = 1n;
  for (const s of valid) commonDen = lcm(commonDen, BigInt(s.denominator));
  let num = 0n;
  for (const s of valid) num += BigInt(s.numerator) * (commonDen / BigInt(s.denominator));
  const den = commonDen * BigInt(valid.length);
  return Number((num * 20000n + den) / (2n * den));
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function lcm(a: bigint, b: bigint): bigint {
  return (a / gcd(a, b)) * b;
}

export const RATINGS = ["Outstanding", "Very Satisfactory", "Satisfactory", "Fair", "Poor"] as const;
export type Rating = (typeof RATINGS)[number];

/** ARTA adjectival rating: Poor < 60.00 ≤ Fair < 80.00 ≤ Satisfactory < 90.00 ≤ Very Satisfactory < 95.00 ≤ Outstanding. */
export function ratingFor(score: Hundredths): Rating {
  if (score >= 9500) return "Outstanding";
  if (score >= 9000) return "Very Satisfactory";
  if (score >= 8000) return "Satisfactory";
  if (score >= 6000) return "Fair";
  return "Poor";
}

export function formatPercent(score: Hundredths | null): string {
  if (score === null) return "—";
  const whole = Math.floor(score / 100);
  const cents = score % 100;
  return `${whole}.${String(cents).padStart(2, "0")}%`;
}

// ---- Citizen's Charter ----------------------------------------------------------------

/** Answer counts per option code; index 0 holds blanks. cc1: 0–4, cc2: 0–5 (5 = N/A), cc3: 0–4 (4 = N/A). */
export interface CcCounts {
  cc1: number[];
  cc2: number[];
  cc3: number[];
}

export function emptyCcCounts(): CcCounts {
  return { cc1: [0, 0, 0, 0, 0], cc2: [0, 0, 0, 0, 0, 0], cc3: [0, 0, 0, 0, 0] };
}

export function tallyCc(counts: CcCounts, cc1: number | null, cc2: number | null, cc3: number | null): void {
  bump(counts.cc1, cc1, "cc1");
  bump(counts.cc2, cc2, "cc2");
  bump(counts.cc3, cc3, "cc3");
}

function bump(bucket: number[], value: number | null, question: string): void {
  const index = value ?? 0;
  if (!Number.isInteger(index) || index < 0 || index >= bucket.length) {
    throw new RangeError(`Not a ${question} option: ${String(value)}`);
  }
  bucket[index] = (bucket[index] ?? 0) + 1;
}

export function sumCc(list: readonly CcCounts[]): CcCounts {
  const total = emptyCcCounts();
  for (const c of list) {
    c.cc1.forEach((v, i) => (total.cc1[i] = (total.cc1[i] ?? 0) + v));
    c.cc2.forEach((v, i) => (total.cc2[i] = (total.cc2[i] ?? 0) + v));
    c.cc3.forEach((v, i) => (total.cc3[i] = (total.cc3[i] ?? 0) + v));
  }
  return total;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** The options a CC percentage is taken over: N/A and blanks are left out. */
function ccBase(counts: CcCounts, question: "cc1" | "cc2" | "cc3"): number {
  if (question === "cc1") return sum(counts.cc1.slice(1, 5));
  if (question === "cc2") return sum(counts.cc2.slice(1, 5));
  return sum(counts.cc3.slice(1, 4));
}

/** One option's share of its question, as in the CC table of a filed report. */
export function ccOptionShare(counts: CcCounts, question: "cc1" | "cc2" | "cc3", option: number): Ratio {
  const denominator = ccBase(counts, question);
  const numerator = counts[question][option] ?? 0;
  return { numerator, denominator, hundredths: percentHundredths(numerator, denominator) };
}

export interface CcSummary {
  /** CC1 options 1–3 over all CC1 answers. */
  awareness: Ratio;
  /** CC2 option 1 ("Easy to see") over CC2 answers 1–4. */
  visibility: Ratio;
  /** CC3 option 1 ("Helped very much") over CC3 answers 1–3. */
  helpfulness: Ratio;
}

export function ccSummary(counts: CcCounts): CcSummary {
  const awareDen = ccBase(counts, "cc1");
  const aware = (counts.cc1[1] ?? 0) + (counts.cc1[2] ?? 0) + (counts.cc1[3] ?? 0);
  return {
    awareness: { numerator: aware, denominator: awareDen, hundredths: percentHundredths(aware, awareDen) },
    visibility: ccOptionShare(counts, "cc2", 1),
    helpfulness: ccOptionShare(counts, "cc3", 1),
  };
}

/** Responses ÷ transactions. Can exceed 100% when counts were under-recorded — shown, not hidden. */
export function responseRate(responses: number, transactions: number): Hundredths | null {
  return percentHundredths(responses, transactions);
}

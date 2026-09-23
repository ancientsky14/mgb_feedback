import { describe, expect, it } from "vitest";
import { SQD_CODES, type SqdCode } from "./constants";
import {
  ccOptionShare,
  ccSummary,
  emptyCcCounts,
  emptyLikertCounts,
  formatPercent,
  meanOfScores,
  overallScore,
  percentHundredths,
  ratingFor,
  responseRate,
  scoreLikert,
  sumLikert,
  tallyCc,
  tallyLikert,
  type CcCounts,
  type LikertCounts,
} from "./scoring";

// Fixtures are published figures from a filed agency report, Philippine Retirement
// Authority "FY 2025 CSM Report" (pra.gov.ph), which follows ARTA MC 2022-05 / 2023-05.
// Its tables list, per item: Strongly Agree, Agree, Neither, Disagree, Strongly Disagree,
// N/A, total responses, score.
const counts = (sa: number, a: number, n: number, d: number, sd: number, na: number): LikertCounts => ({
  sa,
  a,
  n,
  d,
  sd,
  na,
  blank: 0,
});

describe("scoreLikert (ARTA formula) against a filed report", () => {
  it.each([
    ["SQD5 Costs", counts(19, 6, 2, 1, 2, 77), 8333],
    ["SQD6 Integrity", counts(84, 17, 1, 0, 1, 4), 9806],
    ["SQD7 Assurance", counts(86, 15, 2, 1, 0, 3), 9712],
    ["SQD8 Outcome", counts(73, 18, 1, 1, 1, 13), 9681],
  ])("%s", (_label, c, expected) => {
    const s = scoreLikert(c);
    expect(s.answered).toBe(107);
    expect(s.hundredths).toBe(expected);
  });

  it("pools SQD1–SQD8 for the Overall row (568+140 over 856−119 = 96.07%)", () => {
    // Only the column totals are published; spread them over SQD1–8 and check the pooled score.
    const total = counts(568, 140, 12, 7, 10, 119);
    expect(scoreLikert(total).hundredths).toBe(9607);
    expect(scoreLikert(total).answered).toBe(856);
  });
});

describe("overallScore", () => {
  it("uses SQD1–SQD8 and ignores SQD0", () => {
    const bySqd = Object.fromEntries(SQD_CODES.map((c) => [c, counts(1, 0, 0, 0, 0, 0)])) as Record<
      SqdCode,
      LikertCounts
    >;
    bySqd.sqd0 = counts(0, 0, 0, 0, 50, 0); // a terrible SQD0 must not move the overall
    const s = overallScore(bySqd);
    expect(s.denominator).toBe(8);
    expect(s.hundredths).toBe(10000);
  });

  it("equals the pooled column sums, not the mean of item scores", () => {
    const bySqd = Object.fromEntries(SQD_CODES.map((c) => [c, counts(0, 0, 0, 0, 0, 0)])) as Record<
      SqdCode,
      LikertCounts
    >;
    bySqd.sqd1 = counts(1, 0, 0, 0, 0, 0); // 100% over 1
    bySqd.sqd2 = counts(1, 0, 0, 0, 3, 0); // 25% over 4
    // pooled: 2/5 = 40.00%; mean of items would be 62.50%
    expect(overallScore(bySqd).hundredths).toBe(4000);
  });
});

describe("blank and N/A handling", () => {
  it("leaves blanks out of the responses and N/A out of the denominator", () => {
    const c = emptyLikertCounts();
    for (const v of [5, 5, 4, 1, 0, 0, null, null]) tallyLikert(c, v);
    const s = scoreLikert(c);
    expect(c.blank).toBe(2);
    expect(s.answered).toBe(6);
    expect(s.denominator).toBe(4);
    expect(s.hundredths).toBe(7500);
  });

  it("has no score when every answer is N/A", () => {
    expect(scoreLikert(counts(0, 0, 0, 0, 0, 5)).hundredths).toBeNull();
  });

  it("rejects values that are not stored SQD codes", () => {
    expect(() => tallyLikert(emptyLikertCounts(), 6)).toThrow(RangeError);
    expect(() => tallyLikert(emptyLikertCounts(), -1)).toThrow(RangeError);
  });
});

describe("rounding and bands", () => {
  it("rounds half up exactly", () => {
    expect(percentHundredths(1, 32)).toBe(313); // 3.125% → 3.13%
    expect(percentHundredths(1, 3)).toBe(3333);
    expect(percentHundredths(2, 3)).toBe(6667);
    expect(percentHundredths(0, 5)).toBe(0);
    expect(percentHundredths(5, 0)).toBeNull();
  });

  it("applies ARTA bands to the reported two-decimal score", () => {
    expect(ratingFor(10000)).toBe("Outstanding");
    expect(ratingFor(9500)).toBe("Outstanding");
    expect(ratingFor(9499)).toBe("Very Satisfactory");
    expect(ratingFor(9000)).toBe("Very Satisfactory");
    expect(ratingFor(8999)).toBe("Satisfactory");
    expect(ratingFor(8000)).toBe("Satisfactory");
    expect(ratingFor(7999)).toBe("Fair");
    expect(ratingFor(6000)).toBe("Fair");
    expect(ratingFor(5999)).toBe("Poor");
    expect(ratingFor(0)).toBe("Poor");
  });

  it("puts a score that rounds up to 95.00% in the Outstanding band", () => {
    // 18999/20000 = 94.995% → reported as 95.00%
    const h = percentHundredths(18999, 20000);
    expect(h).toBe(9500);
    expect(ratingFor(h!)).toBe("Outstanding");
  });

  it("formats hundredths without floating-point drift", () => {
    expect(formatPercent(9607)).toBe("96.07%");
    expect(formatPercent(10000)).toBe("100.00%");
    expect(formatPercent(5)).toBe("0.05%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("meanOfScores", () => {
  it("averages exactly and skips empty groups", () => {
    const a = scoreLikert(counts(1, 0, 0, 0, 0, 0)); // 100%
    const b = scoreLikert(counts(1, 0, 0, 0, 3, 0)); // 25%
    const empty = scoreLikert(counts(0, 0, 0, 0, 0, 2));
    expect(meanOfScores([a, b, empty])).toBe(6250);
    expect(meanOfScores([empty])).toBeNull();
  });

  it("rounds the exact mean, not the rounded parts", () => {
    // 1/3 and 1/3 → 33.333…% ; 2/3 → 66.666…% ; mean of (1/3, 2/3) = 50.00%
    const third = { numerator: 1, denominator: 3, hundredths: 3333 };
    const twoThirds = { numerator: 2, denominator: 3, hundredths: 6667 };
    expect(meanOfScores([third, twoThirds])).toBe(5000);
  });
});

describe("Citizen's Charter summary against a filed report", () => {
  const fromTable = (cc1: number[], cc2: number[], cc3: number[]): CcCounts => ({
    cc1: [0, ...cc1],
    cc2: [0, ...cc2, 0],
    cc3: [0, ...cc3, 0],
  });

  it("matches the per-option percentages (N/A excluded from CC2 and CC3)", () => {
    const c = fromTable([3849, 162, 181, 135], [3786, 365, 24, 13], [3748, 363, 34]);
    expect(ccOptionShare(c, "cc1", 1).hundredths).toBe(8895);
    expect(ccOptionShare(c, "cc1", 4).hundredths).toBe(312);
    expect(ccOptionShare(c, "cc2", 1).hundredths).toBe(9040);
    expect(ccOptionShare(c, "cc2", 2).hundredths).toBe(872);
    expect(ccOptionShare(c, "cc3", 1).hundredths).toBe(9042);
    expect(ccOptionShare(c, "cc3", 3).hundredths).toBe(82);
  });

  it("counts inconsistent paper answers as written, like the filed report", () => {
    // 285 aware respondents but 297 CC2 answers: the report divides by the 297.
    const c = fromTable([194, 4, 87, 32], [262, 28, 5, 2], [0, 0, 0]);
    expect(ccOptionShare(c, "cc1", 1).hundredths).toBe(6120);
    expect(ccOptionShare(c, "cc2", 1).hundredths).toBe(8822);
  });

  it("summarizes awareness, visibility and helpfulness", () => {
    const c = emptyCcCounts();
    tallyCc(c, 1, 1, 1);
    tallyCc(c, 2, 2, 2);
    tallyCc(c, 3, 5, 4); // aware, but N/A on CC2 and CC3
    tallyCc(c, 4, 5, 4); // not aware
    tallyCc(c, null, null, null); // blank paper form
    const s = ccSummary(c);
    expect(s.awareness).toEqual({ numerator: 3, denominator: 4, hundredths: 7500 });
    expect(s.visibility).toEqual({ numerator: 1, denominator: 2, hundredths: 5000 });
    expect(s.helpfulness).toEqual({ numerator: 1, denominator: 2, hundredths: 5000 });
  });

  it("rejects out-of-range options", () => {
    expect(() => tallyCc(emptyCcCounts(), 5, 1, 1)).toThrow(RangeError);
    expect(() => tallyCc(emptyCcCounts(), 1, 6, 1)).toThrow(RangeError);
  });
});

describe("responseRate", () => {
  it("is responses over transactions and may exceed 100%", () => {
    expect(responseRate(946, 1284)).toBe(7368);
    expect(responseRate(12, 10)).toBe(12000);
    expect(responseRate(3, 0)).toBeNull();
  });
});

describe("sumLikert", () => {
  it("adds every column", () => {
    expect(sumLikert([counts(1, 2, 3, 4, 5, 6), counts(1, 1, 1, 1, 1, 1)])).toEqual(counts(2, 3, 4, 5, 6, 7));
  });
});

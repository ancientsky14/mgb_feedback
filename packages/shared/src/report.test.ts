import { describe, expect, it } from "vitest";
import { buildReport, suppressSmallGroups, type LegacyTallyRow, type ReportResponseRow, type ReportService } from "./report";

const services: ReportService[] = [
  { id: 1, name: "Permit", divisionId: 3, divisionCode: "MMD", isExternal: true, isPlaceholder: false },
  { id: 2, name: "Geohazard", divisionId: 4, divisionCode: "GD", isExternal: true, isPlaceholder: false },
  { id: 3, name: "Unused", divisionId: 4, divisionCode: "GD", isExternal: true, isPlaceholder: false },
];

const response = (service_id: number, sqd: number | null, overrides: Partial<ReportResponseRow> = {}): ReportResponseRow => ({
  service_id,
  channel: "qr",
  client_type: "citizen",
  sex: null,
  age: 40,
  region: "R01",
  cc1: 1,
  cc2: 1,
  cc3: 1,
  sqd0: sqd,
  sqd1: sqd,
  sqd2: sqd,
  sqd3: sqd,
  sqd4: sqd,
  sqd5: sqd,
  sqd6: sqd,
  sqd7: sqd,
  sqd8: sqd,
  ...overrides,
});

const period = { from: "2026-01", to: "2026-12" };

describe("buildReport", () => {
  const responses = [
    ...Array.from({ length: 6 }, () => response(1, 5)), // 6 × Strongly Agree
    response(1, 2), // 1 × Disagree
    response(1, 0, { cc1: 4, cc2: 5, cc3: 4 }), // all N/A, not aware of the CC
    response(2, 4),
    response(2, 3, { channel: "paper", sex: "female", age: null }),
  ];
  const report = buildReport({ period, services, responses, legacy: [], transactions: [{ service_id: 1, count: 16 }] });

  it("scores each service with the ARTA formula", () => {
    const permit = report.services.find((s) => s.service.id === 1)!;
    expect(permit.respondents).toBe(8);
    // SQD1: 6 favorable over 8 answers minus 1 N/A = 6/7
    expect(permit.sqd.sqd1.score.hundredths).toBe(8571);
    // Overall pools SQD1–8: 48 favorable over 64 − 8 N/A = 48/56
    expect(permit.overall.hundredths).toBe(8571);
    expect(permit.rating).toBe("Satisfactory");
    expect(permit.responseRate).toBe(5000);
  });

  it("leaves out services with nothing to report", () => {
    expect(report.services.map((s) => s.service.id)).toEqual([1, 2]);
  });

  it("pools the office totals and also gives the mean of service scores", () => {
    // Office SQD1–8: permit 48/56, geohazard 8 favorable of 16 → 56/72
    expect(report.office.overall.hundredths).toBe(7778);
    // Mean of 85.714…% and 50% = 67.857…%
    expect(report.office.overallMeanOfServices).toBe(6786);
    expect(report.office.respondents).toBe(10);
    // Transactions only known for the permit service
    expect(report.office.transactions).toBe(16);
  });

  it("summarizes the Citizen's Charter across services", () => {
    expect(report.office.ccSummary.awareness).toMatchObject({ numerator: 9, denominator: 10 });
    expect(report.office.ccSummary.visibility).toMatchObject({ numerator: 9, denominator: 9 });
  });

  it("counts demographics and channels", () => {
    expect(report.demographics.channel).toMatchObject({ qr: 9, paper: 1 });
    expect(report.demographics.sex).toMatchObject({ female: 1, unspecified: 9 });
    expect(report.demographics.ageBracket).toMatchObject({ "35_49": 9, unspecified: 1 });
  });

  it("adds legacy tallies to per-response data", () => {
    const legacy: LegacyTallyRow[] = [
      { service_id: 2, question: "respondents", option: -1, count: 4 },
      ...["sqd1", "sqd2", "sqd3", "sqd4", "sqd5", "sqd6", "sqd7", "sqd8"].map((q) => ({ service_id: 2, question: q, option: 5, count: 4 })),
      { service_id: 2, question: "sqd0", option: -1, count: 4 }, // SQD0 left blank on all four
      { service_id: 2, question: "cc1", option: 2, count: 4 },
    ];
    const withLegacy = buildReport({ period, services, responses, legacy, transactions: [] });
    const geo = withLegacy.services.find((s) => s.service.id === 2)!;
    expect(geo.respondents).toBe(6);
    // SQD1: 1 (agree) + 4 (legacy strongly agree) favorable over 6
    expect(geo.sqd.sqd1.score).toMatchObject({ numerator: 5, denominator: 6 });
    expect(geo.sqd.sqd0.counts.blank).toBe(4);
    expect(geo.sqd.sqd0.score.denominator).toBe(2);
    expect(geo.cc.cc1[2]).toBe(4);
    expect(withLegacy.includesLegacyTallies).toBe(true);
  });

  it("rejects malformed legacy rows instead of miscounting them", () => {
    expect(() =>
      buildReport({ period, services, responses: [], legacy: [{ service_id: 1, question: "sqd9", option: 1, count: 1 }], transactions: [] }),
    ).toThrow(RangeError);
    expect(() =>
      buildReport({ period, services, responses: [], legacy: [{ service_id: 1, question: "sqd1", option: 7, count: 1 }], transactions: [] }),
    ).toThrow(RangeError);
  });
});

describe("suppressSmallGroups", () => {
  const responses = [...Array.from({ length: 6 }, () => response(1, 5)), response(2, 1), response(2, 2)];
  const full = buildReport({ period, services, responses, legacy: [], transactions: [] });
  const scoped = suppressSmallGroups(full, 5);

  it("hides a service with fewer than five respondents", () => {
    const geo = scoped.services.find((s) => s.service.id === 2)!;
    expect(geo.suppressed).toBe(true);
    expect(geo.respondents).toBe(0);
    expect(geo.overall.hundredths).toBeNull();
    expect(scoped.services.find((s) => s.service.id === 1)!.suppressed).toBe(false);
  });

  it("leaves hidden services out of the totals, so they cannot be recovered by subtraction", () => {
    expect(full.office.respondents).toBe(8);
    expect(scoped.office.respondents).toBe(6);
    expect(scoped.officeExcludesHiddenServices).toBe(true);
    expect(scoped.office.overall.hundredths).toBe(10000);
  });

  it("hides a whole breakdown when any group in it is small", () => {
    const mixed = buildReport({
      period,
      services,
      responses: [...Array.from({ length: 7 }, () => response(1, 5)), response(1, 5, { channel: "paper" })],
      legacy: [],
      transactions: [],
    });
    const hidden = suppressSmallGroups(mixed, 5);
    expect(Object.values(hidden.demographics.channel).every((v) => v === null)).toBe(true);
    // Region: all eight in R01, no small group → shown.
    expect(hidden.demographics.region.R01).toBe(8);
  });

  it("changes nothing for groups that are large enough", () => {
    const big = buildReport({ period, services, responses: Array.from({ length: 5 }, () => response(1, 4)), legacy: [], transactions: [] });
    expect(suppressSmallGroups(big, 5).office).toEqual(big.office);
  });
});

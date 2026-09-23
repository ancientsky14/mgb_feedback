import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv-parse";
import {
  detectColumns,
  parseCcAnswer,
  parseImportDate,
  parseLikert,
  parseOnlineRow,
  parseRegion,
} from "./import-online";
import { parseTallyCsv, tallyTemplateRows, TALLY_COLUMNS } from "./import-tally";
import { ARTA_CSM_2420_03_ONSITE } from "./instrument";

describe("parseCsv", () => {
  it("reads quotes, doubled quotes, embedded commas and line breaks", () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"two, and ""three""","line\nbreak"\n\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", 'two, and "three"', "line\nbreak"],
    ]);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,"b')).toThrow(/quoted field/);
  });
});

// Headers as a Google Form built from the ARTA questionnaire would export them.
const HEADERS = [
  "Timestamp",
  "Email Address",
  "Client type",
  "Date",
  "Sex",
  "Age",
  "Region of residence",
  "Service Availed",
  "CC1. Which of the following best describes your awareness of a CC?",
  "CC2. If aware of CC (answered 1-3 in CC1), would you say that the CC of this office was …?",
  "CC3. If aware of CC (answered codes 1-3 in CC1), how much did the CC help you in your transaction?",
  "SQD0. I am satisfied with the service that I availed.",
  "SQD1. I spent a reasonable amount of time for my transaction.",
  "SQD2. The office followed the transaction’s requirements and steps",
  "SQD3. The steps (including payment) I needed to do were easy and simple.",
  "SQD4. I easily found information about my transaction from the office or its website.",
  "SQD5. I paid a reasonable amount of fees for my transaction.",
  "SQD6. I feel the office was fair to everyone",
  "SQD7. I was treated courteously by the staff",
  "SQD8. I got what I needed from the government office",
  "Suggestions on how we can further improve our services (optional)",
];

describe("detectColumns", () => {
  it("finds every ARTA field by item code, and ignores the email column", () => {
    const d = detectColumns(HEADERS);
    expect(d.missing).toEqual([]);
    expect(d.columns.transactionDate).toBe(3); // "Date", not "Timestamp"
    expect(d.columns.service).toBe(7); // not grabbed by SQD0's "…the service that I availed"
    expect(d.columns.sqd0).toBe(11);
    expect(d.columns.sqd8).toBe(19);
    expect(d.ignored).toEqual(["Timestamp", "Email Address"]);
  });

  it("falls back to the timestamp when the form has no date question", () => {
    const d = detectColumns(HEADERS.filter((h) => h !== "Date"));
    expect(d.columns.transactionDate).toBe(0);
  });

  it("reports missing core columns", () => {
    expect(detectColumns(["Date", "Service Availed"]).missing).toContain("sqd0");
  });
});

describe("answer parsing", () => {
  it.each([
    ["Strongly Agree", 5],
    ["agree", 4],
    ["Neither Agree nor Disagree", 3],
    ["Disagree", 2],
    ["strongly disagree", 1],
    ["N/A", 0],
    ["Not Applicable", 0],
    ["4", 4],
    ["", null],
    ["maybe", undefined],
  ] as const)("SQD %s → %s", (text, expected) => {
    expect(parseLikert(text)).toBe(expected);
  });

  it("reads CC answers by number or wording", () => {
    const inst = ARTA_CSM_2420_03_ONSITE;
    expect(parseCcAnswer("1. I know what a CC is and I saw this office's CC.", "cc1", inst)).toBe(1);
    expect(parseCcAnswer("I learned of the CC only when I saw this office’s CC.", "cc1", inst)).toBe(3);
    expect(parseCcAnswer("I do not know what a CC is and I did not see one in this office.", "cc1", inst)).toBe(4);
    expect(parseCcAnswer("Easy to see", "cc2", inst)).toBe(1);
    expect(parseCcAnswer("N/A", "cc2", inst)).toBe(5);
    expect(parseCcAnswer("N/A", "cc3", inst)).toBe(4);
    expect(parseCcAnswer("6", "cc1", inst)).toBeUndefined();
    expect(parseCcAnswer("", "cc3", inst)).toBeNull();
  });

  it.each([
    ["Region I", "R01"],
    ["Region 1", "R01"],
    ["region i - ilocos region", "R01"],
    ["Ilocos Region", "R01"],
    ["ilocos", "R01"],
    ["NCR", "NCR"],
    ["Region IV-A", "R4A"],
    ["Region 4A", "R4A"],
    ["CALABARZON", "R4A"],
    ["Cordillera Administrative Region", "CAR"],
    ["region", undefined],
    ["Mars", undefined],
    ["", null],
  ] as const)("region %s → %s", (text, expected) => {
    expect(parseRegion(text)).toBe(expected);
  });

  it("reads spreadsheet dates in the chosen order", () => {
    expect(parseImportDate("2026-09-23", "mdy")).toBe("2026-09-23");
    expect(parseImportDate("9/23/2026 14:05:11", "mdy")).toBe("2026-09-23");
    expect(parseImportDate("23/9/2026", "dmy")).toBe("2026-09-23");
    expect(parseImportDate("23/9/2026", "mdy")).toBeNull();
    expect(parseImportDate("yesterday", "mdy")).toBeNull();
  });
});

describe("parseOnlineRow", () => {
  const columns = detectColumns(HEADERS).columns;
  const context = {
    services: [
      { id: 3, name: "Mining permit or tenement application" },
      { id: 5, name: "Geohazard assessment" },
    ],
    instrument: ARTA_CSM_2420_03_ONSITE,
    dateOrder: "mdy" as const,
    today: "2026-09-23",
  };
  const row = (overrides: Record<number, string> = {}) => {
    const cells = [
      "9/2/2026 10:00:00",
      "someone@example.com",
      "Business",
      "9/2/2026",
      "Female",
      "52",
      "Region I",
      "Mining permit or tenement application",
      "1",
      "Easy to see",
      "Helped very much",
      "Strongly Agree",
      "Agree",
      "Agree",
      "Neither Agree nor Disagree",
      "Strongly Agree",
      "N/A",
      "Strongly Agree",
      "Strongly Agree",
      "Agree",
      "Faster release, please",
    ];
    for (const [i, v] of Object.entries(overrides)) cells[Number(i)] = v;
    return cells;
  };

  it("maps a complete row", () => {
    const r = parseOnlineRow(row(), columns, context);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({
      transactionDate: "2026-09-02",
      serviceId: 3,
      clientType: "business",
      sex: "female",
      age: 52,
      region: "R01",
      cc1: 1,
      cc2: 1,
      cc3: 1,
      suggestion: "Faster release, please",
    });
    expect(r.row.sqd).toEqual({ sqd0: 5, sqd1: 4, sqd2: 4, sqd3: 3, sqd4: 5, sqd5: 0, sqd6: 5, sqd7: 5, sqd8: 4 });
    expect(r.warnings).toEqual([]);
  });

  it("never carries the email address across", () => {
    const r = parseOnlineRow(row(), columns, context);
    expect(JSON.stringify(r)).not.toContain("someone@example.com");
  });

  it("rejects a row whose core answers cannot be read", () => {
    const r = parseOnlineRow(row({ 12: "Kind of" }), columns, context);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("SQD1");
  });

  it("rejects unknown services and future dates", () => {
    expect(parseOnlineRow(row({ 7: "Something else" }), columns, context).ok).toBe(false);
    expect(parseOnlineRow(row({ 3: "10/1/2026" }), columns, context).ok).toBe(false);
  });

  it("keeps an unreadable optional answer as blank, with a warning", () => {
    const r = parseOnlineRow(row({ 6: "Atlantis", 5: "old" }), columns, context);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.region).toBeNull();
    expect(r.row.age).toBeNull();
    expect(r.warnings).toHaveLength(2);
  });
});

describe("paper tally template", () => {
  const services = [
    { id: 3, name: "Permit" },
    { id: 5, name: "Geohazard" },
  ];

  it("round-trips: a filled template parses into tally records", () => {
    const rows = tallyTemplateRows(services, ["2026-01"]);
    expect(rows[0]).toEqual([...TALLY_COLUMNS]);
    const header = rows[0]!;
    const filled = rows.map((r) => [...r]);
    const set = (row: number, column: string, value: string) => {
      filled[row]![header.indexOf(column)] = value;
    };
    set(1, "respondents", "3");
    set(1, "cc1_1", "2");
    set(1, "cc1_4", "1");
    set(1, "sqd1_sa", "2");
    set(1, "sqd1_na", "1");
    const result = parseTallyCsv(filled, new Set([3, 5]));
    expect(result.rowErrors).toEqual([]);
    expect(result.months).toEqual(["2026-01"]);
    expect(result.records).toEqual(
      expect.arrayContaining([
        { service_id: 3, month: "2026-01", question: "respondents", option: -1, count: 3 },
        { service_id: 3, month: "2026-01", question: "cc1", option: 1, count: 2 },
        { service_id: 3, month: "2026-01", question: "sqd1", option: 5, count: 2 },
        { service_id: 3, month: "2026-01", question: "sqd1", option: 0, count: 1 },
      ]),
    );
    expect(result.records.every((r) => r.count > 0)).toBe(true);
    // Totals that do not add up to the respondents are flagged, not silently accepted.
    expect(result.warnings.some((w) => w.includes("SQD0 answers add up to 0, respondents is 3"))).toBe(true);
  });

  it("rejects bad months, unknown services, negative counts and duplicates", () => {
    const header = [...TALLY_COLUMNS];
    const blank = header.map(() => "");
    const line = (month: string, service: string, sqd = "") => {
      const r = [...blank];
      r[0] = month;
      r[1] = service;
      r[header.indexOf("sqd0_sa")] = sqd;
      return r;
    };
    const result = parseTallyCsv(
      [header, line("2026-13", "3"), line("2026-01", "99"), line("2026-01", "3", "-2"), line("2026-02", "3"), line("2026-02", "3")],
      new Set([3]),
    );
    expect(result.rowErrors.map((e) => e.row)).toEqual([2, 3, 4, 6]);
  });

  it("refuses a sheet that is not the template", () => {
    const result = parseTallyCsv([["month", "service", "count"]], new Set([3]));
    expect(result.rowErrors[0]?.errors[0]).toContain("Missing columns");
  });
});

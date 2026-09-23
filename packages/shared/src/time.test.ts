import { describe, expect, it } from "vitest";
import { ageBracket } from "./age";
import { addDays, isAcceptableTransactionDate, isIsoDate, isIsoMonth, manilaDate } from "./time";

describe("Manila dates", () => {
  it("puts 7:30 AM on 1 January in Manila in the new year", () => {
    // 2026-12-31T23:30Z is 2027-01-01 07:30 in Manila
    expect(manilaDate(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(manilaDate(new Date("2026-12-31T15:59:59Z"))).toBe("2026-12-31");
    expect(manilaDate(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
  });

  it("validates ISO dates and months", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("26-02-28")).toBe(false);
    expect(isIsoMonth("2026-12")).toBe(true);
    expect(isIsoMonth("2026-13")).toBe(false);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("accepts transaction dates from today back to the limit only", () => {
    expect(isAcceptableTransactionDate("2026-09-23", "2026-09-23", 90)).toBe(true);
    expect(isAcceptableTransactionDate("2026-09-24", "2026-09-23", 90)).toBe(false);
    expect(isAcceptableTransactionDate("2026-06-25", "2026-09-23", 90)).toBe(true);
    expect(isAcceptableTransactionDate("2026-06-24", "2026-09-23", 90)).toBe(false);
  });
});

describe("ageBracket", () => {
  it.each([
    [null, "unspecified"],
    [0, "unspecified"],
    [19, "le19"],
    [20, "20_34"],
    [34, "20_34"],
    [35, "35_49"],
    [50, "50_64"],
    [64, "50_64"],
    [65, "ge65"],
  ] as const)("%s → %s", (age, bracket) => {
    expect(ageBracket(age)).toBe(bracket);
  });
});

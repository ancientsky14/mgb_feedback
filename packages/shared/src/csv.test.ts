import { describe, expect, it } from "vitest";
import { escapeCsvCell, neutralizeFormula, toCsv } from "./csv";

describe("CSV export safety", () => {
  it.each([
    ["=HYPERLINK(\"http://evil\",\"x\")", "\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\""],
    ["+63 917 000 0000", "'+63 917 000 0000"],
    ["-1+1", "'-1+1"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tcmd", "'\tcmd"],
  ])("neutralizes formula-like text %s", (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it("leaves numbers as numbers, including negatives", () => {
    expect(escapeCsvCell(-5)).toBe("-5");
    expect(escapeCsvCell(96.07)).toBe("96.07");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(escapeCsvCell('He said "ok", then left\nearly')).toBe('"He said ""ok"", then left\nearly"');
  });

  it("writes empty cells for missing values", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("builds an Excel-friendly file", () => {
    expect(toCsv([["a", 1], ["=x", null]])).toBe("﻿a,1\r\n'=x,\r\n");
  });

  it("neutralizeFormula is a no-op on ordinary text", () => {
    expect(neutralizeFormula("Salamat po")).toBe("Salamat po");
  });
});

import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { columnName, toXlsx } from "./xlsx";

const sheetXml = (workbook: Uint8Array, n = 1) => strFromU8(unzipSync(workbook)[`xl/worksheets/sheet${n}.xml`]!);

describe("toXlsx", () => {
  it("writes the parts Excel needs, one worksheet per sheet", () => {
    const files = unzipSync(toXlsx([{ name: "Summary", rows: [["a"]] }, { name: "SQD detail", rows: [["b"]] }]));
    expect(Object.keys(files).sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ].sort(),
    );
    expect(strFromU8(files["xl/workbook.xml"]!)).toContain(`<sheet name="SQD detail" sheetId="2" r:id="rId2"/>`);
    expect(strFromU8(files["xl/styles.xml"]!)).toContain(`numFmtId="10"`); // Excel's built-in 0.00%
  });

  it("stores numbers as numbers and percentages as fractions with the percent style", () => {
    const xml = sheetXml(toXlsx([{ name: "S", rows: [["Header"], [12, { percent: 9607 }, { percent: null }, null]] }]));
    expect(xml).toContain(`<c r="A2"><v>12</v></c>`);
    expect(xml).toContain(`<c r="B2" s="1"><v>0.9607</v></c>`);
    expect(xml).toContain(`<c r="C2" t="inlineStr"><is><t xml:space="preserve">—</t></is></c>`);
    expect(xml).not.toContain(`r="D2"`);
    expect(xml).toContain(`<c r="A1" t="inlineStr" s="2">`); // bold header
  });

  it("escapes text, drops characters XML forbids, and never writes a formula", () => {
    const xml = sheetXml(toXlsx([{ name: "S", rows: [["h"], [`=HYPERLINK("http://evil")&<b>\u0007`]] }]));
    expect(xml).toContain(`=HYPERLINK(&quot;http://evil&quot;)&amp;&lt;b&gt;</t>`);
    expect(xml).not.toContain("<f>");
    expect(xml).not.toContain("\u0007");
  });

  it("refuses sheet names Excel would reject", () => {
    expect(() => toXlsx([])).toThrow();
    expect(() => toXlsx([{ name: "a/b", rows: [] }])).toThrow();
    expect(() => toXlsx([{ name: "x".repeat(32), rows: [] }])).toThrow();
    expect(() => toXlsx([{ name: "Same", rows: [] }, { name: "same", rows: [] }])).toThrow();
  });

  it.each([
    [0, "A"],
    [25, "Z"],
    [26, "AA"],
    [51, "AZ"],
    [52, "BA"],
    [701, "ZZ"],
    [702, "AAA"],
  ])("names column %i %s", (index, name) => {
    expect(columnName(index)).toBe(name);
  });
});

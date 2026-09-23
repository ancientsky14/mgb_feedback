// Exports carry text typed by the public. A cell starting with = + - @ tab or CR can run
// as a formula when the file is opened in Excel (OWASP "CSV injection"), so such text is
// prefixed with an apostrophe. Numbers are left alone.

const FORMULA_START = /^[=+\-@\t\r]/;
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

export function neutralizeFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "number" || typeof value === "bigint") text = String(value);
  else if (typeof value === "boolean") text = value ? "true" : "false";
  else text = neutralizeFormula(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV with a UTF-8 byte-order mark and CRLF line ends, so Excel opens ñ and ₱ correctly. */
export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return `${BYTE_ORDER_MARK}${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
}

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INSTRUMENTS } from ".";

// Every version in code needs its instrument_versions row (responses reference it), with the
// same mode, PSA number and expiry; a row without code would be a form nobody can render.
const migrations = fileURLToPath(new URL("../../../../migrations/", import.meta.url));
const sql = readdirSync(migrations)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(`${migrations}${f}`, "utf8"))
  .join("\n");
const rows = [...sql.matchAll(/\('(ARTA-[^']+)', '(onsite|online)', '([^']+)', '([^']+)', '(draft|active|retired)'/g)].map((m) => ({
  code: m[1]!,
  mode: m[2]!,
  psaApprovalNo: m[3]!,
  psaExpiry: m[4]!,
}));

describe("instrument versions in code and in the database", () => {
  it("match one to one", () => {
    expect(rows.map((r) => r.code).sort()).toEqual(Object.keys(INSTRUMENTS).sort());
  });

  it.each(Object.values(INSTRUMENTS))("$code has the same mode, PSA number and expiry", (inst) => {
    expect(rows.find((r) => r.code === inst.code)).toEqual({
      code: inst.code,
      mode: inst.mode,
      psaApprovalNo: inst.psaApprovalNo,
      psaExpiry: inst.psaExpiry,
    });
  });
});

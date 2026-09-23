import { describe, expect, it } from "vitest";
import { CC_OPTION_COUNT, SQD_CODES } from "../constants";
import { ARTA_CSM_2420_03_ONLINE, ARTA_CSM_2420_03_ONSITE, INSTRUMENTS, getInstrument, isPsaExpired } from ".";

const versions = [ARTA_CSM_2420_03_ONSITE, ARTA_CSM_2420_03_ONLINE];

describe("ARTA CSM instrument definitions", () => {
  it.each(versions)("$code has SQD0–SQD8 in order", (inst) => {
    expect(inst.sqd.map((i) => i.code)).toEqual([...SQD_CODES]);
  });

  it.each(versions)("$code has the ARTA option counts for CC1–CC3", (inst) => {
    expect(inst.cc.map((q) => q.code)).toEqual(["cc1", "cc2", "cc3"]);
    for (const q of inst.cc) {
      expect(q.options.map((o) => o.code)).toEqual(Array.from({ length: CC_OPTION_COUNT[q.code] }, (_, i) => i + 1));
    }
  });

  it.each(versions)("$code always offers English", (inst) => {
    expect(inst.approvedLanguages).toContain("en");
  });

  it("differs between on-site and online only where ARTA's two versions differ", () => {
    const differing = SQD_CODES.filter(
      (code, i) => ARTA_CSM_2420_03_ONSITE.sqd[i]?.text.en !== ARTA_CSM_2420_03_ONLINE.sqd[i]?.text.en,
    );
    expect(differing).toEqual(["sqd4", "sqd6", "sqd7"]);
    expect(ARTA_CSM_2420_03_ONSITE.mode).toBe("onsite");
    expect(ARTA_CSM_2420_03_ONLINE.mode).toBe("online");
  });

  it("uses the on-site integrity item ('walang palakasan') for in-person transactions", () => {
    expect(ARTA_CSM_2420_03_ONSITE.sqd[6]?.text.en).toContain("walang palakasan");
    expect(ARTA_CSM_2420_03_ONLINE.sqd[6]?.text.en).toContain("online transaction was secure");
  });

  it("registers every version under a unique code", () => {
    expect(Object.keys(INSTRUMENTS).sort()).toEqual(versions.map((v) => v.code).sort());
    expect(getInstrument("ARTA-2420-03-ONSITE")).toBe(ARTA_CSM_2420_03_ONSITE);
    expect(getInstrument("toString")).toBeUndefined();
    expect(getInstrument("nope")).toBeUndefined();
  });

  it("knows when the printed PSA clearance has lapsed", () => {
    expect(isPsaExpired(ARTA_CSM_2420_03_ONSITE, "2025-07-31")).toBe(false);
    expect(isPsaExpired(ARTA_CSM_2420_03_ONSITE, "2025-08-01")).toBe(true);
  });
});

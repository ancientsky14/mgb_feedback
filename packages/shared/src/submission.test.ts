import { describe, expect, it } from "vitest";
import { fieldErrors, onlineSubmissionSchema, paperResponseSchema } from "./submission";

const allAgree = { sqd0: 5, sqd1: 4, sqd2: 4, sqd3: 5, sqd4: 4, sqd5: 0, sqd6: 5, sqd7: 5, sqd8: 4 };

const valid = {
  submissionId: "9b2f1c4e-2f7a-4c8e-9d1a-3b5c7e9f1a2b",
  servicePoint: "7KQ2MX",
  instrument: "ARTA-2420-03-ONSITE",
  lang: "en",
  serviceId: 3,
  transactionDate: "2026-09-22",
  clientType: "business",
  sex: null,
  age: null,
  region: "R01",
  cc1: 1,
  cc2: 1,
  cc3: 2,
  sqd: allAgree,
  suggestion: "  More chairs in the waiting area.  ",
  email: "",
  turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
};

describe("onlineSubmissionSchema", () => {
  it("accepts a complete submission and normalizes optional text", () => {
    const r = onlineSubmissionSchema.parse(valid);
    expect(r.suggestion).toBe("More chairs in the waiting area.");
    expect(r.email).toBeNull();
  });

  it("lower-cases a given email and rejects a malformed one", () => {
    expect(onlineSubmissionSchema.parse({ ...valid, email: " Juan@Example.PH " }).email).toBe("juan@example.ph");
    expect(onlineSubmissionSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("turns a whitespace-only suggestion into no suggestion", () => {
    expect(onlineSubmissionSchema.parse({ ...valid, suggestion: "   " }).suggestion).toBeNull();
  });

  it("rejects unknown fields rather than storing them", () => {
    const r = onlineSubmissionSchema.safeParse({ ...valid, staffName: "x" });
    expect(r.success).toBe(false);
  });

  it("requires every SQD item, allowing N/A (0)", () => {
    const { sqd8: _omitted, ...missing } = allAgree;
    expect(onlineSubmissionSchema.safeParse({ ...valid, sqd: missing }).success).toBe(false);
    expect(onlineSubmissionSchema.safeParse({ ...valid, sqd: { ...allAgree, sqd8: 6 } }).success).toBe(false);
    expect(onlineSubmissionSchema.safeParse({ ...valid, sqd: { ...allAgree, sqd8: 0 } }).success).toBe(true);
  });

  it("enforces the CC skip rule: CC1 = 4 means CC2 and CC3 are N/A", () => {
    expect(onlineSubmissionSchema.safeParse({ ...valid, cc1: 4, cc2: 5, cc3: 4 }).success).toBe(true);
    const bad = onlineSubmissionSchema.safeParse({ ...valid, cc1: 4, cc2: 1, cc3: 4 });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(fieldErrors(bad.error)).toHaveProperty("cc2");
  });

  it("rejects an oversized suggestion", () => {
    expect(onlineSubmissionSchema.safeParse({ ...valid, suggestion: "x".repeat(2001) }).success).toBe(false);
  });

  it("rejects impossible dates and unknown regions", () => {
    expect(onlineSubmissionSchema.safeParse({ ...valid, transactionDate: "2026-02-30" }).success).toBe(false);
    expect(onlineSubmissionSchema.safeParse({ ...valid, region: "R99" }).success).toBe(false);
  });
});

describe("paperResponseSchema", () => {
  const paper = {
    controlNo: "2026-0001",
    servicePointId: null,
    serviceId: 3,
    instrument: "ARTA-2420-03-ONSITE",
    transactionDate: "2026-09-01",
    clientType: null,
    sex: "female",
    age: 41,
    region: null,
    cc1: 4,
    cc2: 1, // inconsistent with CC1 = 4, but it is what the client wrote
    cc3: null,
    sqd: { ...allAgree, sqd3: null, sqd5: null },
    suggestion: null,
    email: null,
  };

  it("keeps blanks and inconsistent answers exactly as written", () => {
    const r = paperResponseSchema.parse(paper);
    expect(r.sqd.sqd3).toBeNull();
    expect(r.cc2).toBe(1);
  });

  it("requires a control number", () => {
    expect(paperResponseSchema.safeParse({ ...paper, controlNo: "  " }).success).toBe(false);
  });
});

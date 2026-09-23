import { z } from "zod";
import {
  CC1_NOT_AWARE,
  CC2_NA,
  CC3_NA,
  CLIENT_TYPES,
  EMAIL_MAX_LENGTH,
  LANGUAGES,
  SEXES,
  SQD_CODES,
  SUGGESTION_MAX_LENGTH,
} from "./constants";
import { REGION_CODES } from "./regions";
import { isIsoDate } from "./time";

const isoDate = z.string().refine(isIsoDate, "Expected a date as YYYY-MM-DD");
const likert = z.number().int().min(0).max(5); // 1–5, 0 = N/A
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim())
    .transform((s) => (s === "" ? null : s))
    .nullable();

/** Every SQD item answered (N/A allowed), as the online form requires. */
const sqdAnswered = z.strictObject(
  Object.fromEntries(SQD_CODES.map((code) => [code, likert])) as Record<(typeof SQD_CODES)[number], typeof likert>,
);

const nullableLikert = likert.nullable();
/** Paper forms may carry blanks: null. */
const sqdAsWritten = z.strictObject(
  Object.fromEntries(SQD_CODES.map((code) => [code, nullableLikert])) as Record<
    (typeof SQD_CODES)[number],
    typeof nullableLikert
  >,
);

const email = z
  .string()
  .max(EMAIL_MAX_LENGTH)
  .transform((s) => s.trim())
  .pipe(z.union([z.literal(""), z.email()]))
  .transform((s) => (s === "" ? null : s.toLowerCase()))
  .nullable();

/** What the public form posts. The Worker adds everything else (channel, times, references). */
export const onlineSubmissionSchema = z
  .strictObject({
    submissionId: z.uuid(),
    servicePoint: z.string().min(1).max(16),
    instrument: z.string().min(1).max(64),
    lang: z.enum(LANGUAGES),
    serviceId: z.number().int().positive(),
    transactionDate: isoDate,
    clientType: z.enum(CLIENT_TYPES),
    sex: z.enum(SEXES).nullable(),
    age: z.number().int().min(1).max(120).nullable(),
    region: z.enum(REGION_CODES).nullable(),
    cc1: z.number().int().min(1).max(4),
    cc2: z.number().int().min(1).max(5),
    cc3: z.number().int().min(1).max(4),
    sqd: sqdAnswered,
    suggestion: optionalText(SUGGESTION_MAX_LENGTH),
    email,
    turnstileToken: z.string().min(1).max(2048),
  })
  .superRefine((value, ctx) => {
    // The form's own rule: not aware of a CC (CC1 = 4) → CC2 and CC3 are N/A.
    if (value.cc1 === CC1_NOT_AWARE && (value.cc2 !== CC2_NA || value.cc3 !== CC3_NA)) {
      ctx.addIssue({ code: "custom", message: "CC2 and CC3 must be N/A when CC1 is 4", path: ["cc2"] });
    }
  });

export type OnlineSubmission = z.output<typeof onlineSubmissionSchema>;

/**
 * A paper form typed in by CART, recorded exactly as written — blanks stay blank, and an
 * inconsistent CC answer is kept rather than corrected (filed reports count them as written).
 */
export const paperResponseSchema = z.strictObject({
  controlNo: z.string().trim().min(1).max(32),
  servicePointId: z.number().int().positive().nullable(),
  serviceId: z.number().int().positive(),
  instrument: z.string().min(1).max(64),
  transactionDate: isoDate,
  clientType: z.enum(CLIENT_TYPES).nullable(),
  sex: z.enum(SEXES).nullable(),
  age: z.number().int().min(1).max(120).nullable(),
  region: z.enum(REGION_CODES).nullable(),
  cc1: z.number().int().min(1).max(4).nullable(),
  cc2: z.number().int().min(1).max(5).nullable(),
  cc3: z.number().int().min(1).max(4).nullable(),
  sqd: sqdAsWritten,
  suggestion: optionalText(SUGGESTION_MAX_LENGTH),
  email,
});

export type PaperResponse = z.output<typeof paperResponseSchema>;

/** Readable field errors for an API response: { "cc2": ["…"], "sqd.sqd4": ["…"] }. Never echoes input values. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

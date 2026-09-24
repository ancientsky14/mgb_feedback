// Closed sets stored in the database. Every value here is mirrored by a CHECK
// constraint in migrations/ — change both together, never one.

export const LANGUAGES = ["en", "fil", "ilo"] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

export const INSTRUMENT_MODES = ["onsite", "online"] as const;
export type InstrumentMode = (typeof INSTRUMENT_MODES)[number];

export const INSTRUMENT_STATUSES = ["draft", "active", "retired"] as const;
export type InstrumentStatus = (typeof INSTRUMENT_STATUSES)[number];

export const CHANNELS = ["qr", "paper", "import", "kiosk", "online_link"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CLIENT_TYPES = ["citizen", "business", "government"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const SEXES = ["male", "female"] as const;
export type Sex = (typeof SEXES)[number];

export const ROLES = ["admin", "cart", "division_focal", "management"] as const;
export type Role = (typeof ROLES)[number];

export const COMMENT_VISIBILITIES = ["cart_only", "released"] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITIES)[number];

/** Why a response is left out of reports. The row itself stays: responses are official records. */
export const EXCLUSION_REASONS = ["staff_test", "spam", "duplicate", "other"] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];
export const EXCLUSION_REASON_LABELS: Record<ExclusionReason, string> = {
  staff_test: "Staff test",
  spam: "Spam or bot",
  duplicate: "Duplicate",
  other: "Other",
};
export const EXCLUSION_NOTE_MAX_LENGTH = 200;

export const IMPORT_KINDS = ["online_csv", "paper_tally"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const TRANSACTION_COUNT_SOURCES = ["manual", "tokens"] as const;
export type TransactionCountSource = (typeof TRANSACTION_COUNT_SOURCES)[number];

export const SQD_CODES = ["sqd0", "sqd1", "sqd2", "sqd3", "sqd4", "sqd5", "sqd6", "sqd7", "sqd8"] as const;
export type SqdCode = (typeof SQD_CODES)[number];

/** The ARTA overall score covers SQD1–SQD8. SQD0 (overall satisfaction) is reported on its own. */
export const OVERALL_SQD_CODES = SQD_CODES.slice(1) as readonly Exclude<SqdCode, "sqd0">[];

export const CC_CODES = ["cc1", "cc2", "cc3"] as const;
export type CcCode = (typeof CC_CODES)[number];

/** Stored SQD values: 1–5 on the Likert scale, 0 = N/A. NULL (blank) only occurs on paper forms. */
export const LIKERT = { SD: 1, D: 2, N: 3, A: 4, SA: 5, NA: 0 } as const;

/** CC1 option 4 = "I do not know what a CC is and I did not see one" → CC2 and CC3 become N/A. */
export const CC1_NOT_AWARE = 4;
export const CC2_NA = 5;
export const CC3_NA = 4;
export const CC_OPTION_COUNT = { cc1: 4, cc2: 5, cc3: 4 } as const;

/** Groups smaller than this are hidden from division focal persons, so no one can work out who wrote what. */
export const MIN_GROUP_SIZE = 5;

export const SUGGESTION_MAX_LENGTH = 2000;
export const EMAIL_MAX_LENGTH = 254;

/** The action the public form's Turnstile widget is rendered with; the server refuses tokens minted for any other. */
export const TURNSTILE_ACTION = "csm_submit";

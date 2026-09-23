import type { ClientType, InstrumentMode, LanguageCode, SqdCode } from "../constants";

/** Text in each language. English is required; other languages appear only once approved (see approvedLanguages). */
export type Localized = { en: string } & Partial<Record<Exclude<LanguageCode, "en">, string>>;

export interface CcOption {
  code: number;
  label: Localized;
}

export interface CcQuestion {
  code: "cc1" | "cc2" | "cc3";
  text: Localized;
  options: readonly CcOption[];
}

export interface SqdItem {
  code: SqdCode;
  /** ARTA's name for the service quality dimension, used in reports. */
  dimension: string;
  text: Localized;
  hint?: Localized;
}

/**
 * One released version of the ARTA CSM questionnaire. Definitions live in code, are
 * reviewed like code, and are never edited once released — a wording change is a new
 * version with a new code, so every stored response keeps the exact questions it answered.
 */
export interface InstrumentDefinition {
  code: string;
  mode: InstrumentMode;
  psaApprovalNo: string;
  /** ISO date the PSA clearance printed on the form expires; null if none is printed. */
  psaExpiry: string | null;
  /** Languages whose full questionnaire wording is officially approved. Always includes "en". */
  approvedLanguages: readonly LanguageCode[];
  title: Localized;
  intro: Localized;
  clientTypes: Readonly<Record<ClientType, Localized>>;
  ccDefinition: Localized;
  cc: readonly [CcQuestion, CcQuestion, CcQuestion];
  scale: Readonly<Record<1 | 2 | 3 | 4 | 5, Localized>>;
  naLabel: Localized;
  sqd: readonly SqdItem[];
  suggestionLabel: Localized;
  emailLabel: Localized;
  thankYou: Localized;
}

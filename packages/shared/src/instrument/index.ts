import type { LanguageCode } from "../constants";
import { ARTA_CSM_2420_03_ONLINE, ARTA_CSM_2420_03_ONSITE } from "./arta-csm-2420-03";
import type { InstrumentDefinition, Localized } from "./types";

export type { CcOption, CcQuestion, InstrumentDefinition, Localized, SqdItem } from "./types";
export { ARTA_CSM_2420_03_ONLINE, ARTA_CSM_2420_03_ONSITE } from "./arta-csm-2420-03";

/** Every released instrument version. A code here must also have a row in instrument_versions. */
export const INSTRUMENTS: Readonly<Record<string, InstrumentDefinition>> = Object.freeze({
  [ARTA_CSM_2420_03_ONSITE.code]: ARTA_CSM_2420_03_ONSITE,
  [ARTA_CSM_2420_03_ONLINE.code]: ARTA_CSM_2420_03_ONLINE,
});

export function getInstrument(code: string): InstrumentDefinition | undefined {
  return Object.hasOwn(INSTRUMENTS, code) ? INSTRUMENTS[code] : undefined;
}

/** Falls back to English when a language has no approved wording. */
export function localize(text: Localized, lang: LanguageCode): string {
  return text[lang] ?? text.en;
}

/** A language is offered on the form only when the whole questionnaire is approved in it. */
export function offeredLanguages(instrument: InstrumentDefinition): readonly LanguageCode[] {
  return instrument.approvedLanguages;
}

/** True once the PSA clearance printed on the form has lapsed as of `today` (YYYY-MM-DD). */
export function isPsaExpired(instrument: InstrumentDefinition, today: string): boolean {
  return instrument.psaExpiry !== null && instrument.psaExpiry < today;
}

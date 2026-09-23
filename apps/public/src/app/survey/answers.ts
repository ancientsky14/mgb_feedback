import {
  CC1_NOT_AWARE,
  CC2_NA,
  CC3_NA,
  EMAIL_MAX_LENGTH,
  SQD_CODES,
  SUGGESTION_MAX_LENGTH,
  type ClientType,
  type LanguageCode,
  type RegionCode,
  type Sex,
  type SqdCode,
} from "@feedback/shared";
import type { FormContext } from "../api";

export interface Answers {
  submissionId: string;
  instrumentCode: string;
  lang: LanguageCode;
  serviceId: number | null;
  transactionDate: string;
  clientType: ClientType | null;
  /** "declined" is the "Prefer not to answer" choice; it is sent as no answer. */
  sex: Sex | "declined" | null;
  age: string;
  region: RegionCode | "";
  cc1: number | null;
  cc2: number | null;
  cc3: number | null;
  sqd: Partial<Record<SqdCode, number>>;
  suggestion: string;
  email: string;
}

export function freshAnswers(context: FormContext): Answers {
  return {
    submissionId: crypto.randomUUID(),
    instrumentCode: context.instrumentCode,
    lang: "en",
    serviceId: context.defaultServiceId,
    transactionDate: context.today,
    clientType: null,
    sex: null,
    age: "",
    region: "",
    cc1: null,
    cc2: null,
    cc3: null,
    sqd: {},
    suggestion: "",
    email: "",
  };
}

/** Choosing CC1 option 4 makes CC2 and CC3 N/A, as the paper form instructs. */
export function withCc1(a: Answers, cc1: number): Answers {
  if (cc1 === CC1_NOT_AWARE) return { ...a, cc1, cc2: CC2_NA, cc3: CC3_NA };
  // Coming back from option 4: clear the automatic N/A so the client answers CC2 and CC3.
  const wasNotAware = a.cc1 === CC1_NOT_AWARE;
  return { ...a, cc1, cc2: wasNotAware ? null : a.cc2, cc3: wasNotAware ? null : a.cc3 };
}

export type Errors = Record<string, string>;

export function validateProfile(a: Answers, context: FormContext): Errors {
  const e: Errors = {};
  if (!a.clientType) e.clientType = "Please choose your client type.";
  if (a.serviceId === null) e.serviceId = "Please choose the service you availed.";
  if (!a.transactionDate || a.transactionDate > context.today || a.transactionDate < context.earliestTransactionDate) {
    e.transactionDate = "Please enter the date of your transaction (today or a recent date).";
  }
  if (a.age.trim() !== "") {
    const n = Number(a.age);
    if (!Number.isInteger(n) || n < 1 || n > 120) e.age = "Please enter your age in years, or leave it blank.";
  }
  return e;
}

export function validateCc(a: Answers): Errors {
  const e: Errors = {};
  if (a.cc1 === null) e.cc1 = "Please choose one answer for CC1.";
  else if (a.cc1 !== CC1_NOT_AWARE) {
    if (a.cc2 === null) e.cc2 = "Please choose one answer for CC2.";
    if (a.cc3 === null) e.cc3 = "Please choose one answer for CC3.";
  }
  return e;
}

export function validateSqd(a: Answers): Errors {
  const e: Errors = {};
  for (const code of SQD_CODES) {
    if (a.sqd[code] === undefined) e[code] = `Please answer ${code.toUpperCase()}, or choose N/A.`;
  }
  return e;
}

export function validateComments(a: Answers): Errors {
  const e: Errors = {};
  if (a.suggestion.length > SUGGESTION_MAX_LENGTH) e.suggestion = `Please keep your suggestion under ${SUGGESTION_MAX_LENGTH} characters.`;
  const email = a.email.trim();
  if (email.length > EMAIL_MAX_LENGTH || (email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    e.email = "Please check the email address, or leave it blank.";
  }
  return e;
}

export function toPayload(a: Answers, servicePoint: string, turnstileToken: string) {
  return {
    submissionId: a.submissionId,
    servicePoint,
    instrument: a.instrumentCode,
    lang: a.lang,
    serviceId: a.serviceId,
    transactionDate: a.transactionDate,
    clientType: a.clientType,
    sex: a.sex === "declined" ? null : a.sex,
    age: a.age.trim() === "" ? null : Number(a.age),
    region: a.region === "" ? null : a.region,
    cc1: a.cc1,
    cc2: a.cc2,
    cc3: a.cc3,
    sqd: a.sqd,
    suggestion: a.suggestion.trim() === "" ? null : a.suggestion,
    email: a.email.trim() === "" ? null : a.email.trim(),
    turnstileToken,
  };
}

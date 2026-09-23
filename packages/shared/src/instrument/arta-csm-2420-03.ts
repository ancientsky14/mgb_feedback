// ARTA Harmonized Client Satisfaction Measurement form, PSA Approval No. ARTA-2420-03
// (expiry printed on the form: 31 July 2025). Transcribed word for word from the
// On-Site and Online versions (ARTA MC 2022-05 as amended by MC 2023-05), as posted at
// https://www.da.gov.ph/wp-content/uploads/2025/07/ARTA-Client-Satisfaction-Survey-2025.pdf
//
// Replace, never edit: when CART supplies the version in force, add a new file with a new
// code and retire this one. Stored responses keep pointing at the version they answered.

import type { InstrumentDefinition, SqdItem } from "./types";

const TITLE = { en: "HELP US SERVE YOU BETTER!" };

const CLIENT_TYPES = {
  citizen: { en: "Citizen" },
  business: { en: "Business" },
  government: { en: "Government (Employee or another agency)" },
} as const;

const CC_DEFINITION = {
  en: "The Citizen’s Charter is an official document that reflects the services of a government agency/office including its requirements, fees, and processing times among others.",
};

const CC1 = {
  code: "cc1",
  text: { en: "Which of the following best describes your awareness of a CC?" },
  options: [
    { code: 1, label: { en: "I know what a CC is and I saw this office’s CC." } },
    { code: 2, label: { en: "I know what a CC is but I did NOT see this office’s CC." } },
    { code: 3, label: { en: "I learned of the CC only when I saw this office’s CC." } },
    {
      code: 4,
      label: { en: "I do not know what a CC is and I did not see one in this office. (Answer ‘N/A’ on CC2 and CC3)" },
    },
  ],
} as const;

const SCALE = {
  1: { en: "Strongly Disagree" },
  2: { en: "Disagree" },
  3: { en: "Neither Agree nor Disagree" },
  4: { en: "Agree" },
  5: { en: "Strongly Agree" },
} as const;

const SUGGESTION_LABEL = { en: "Suggestions on how we can further improve our services (optional):" };
const EMAIL_LABEL = { en: "Email address (optional):" };
const THANK_YOU = { en: "THANK YOU!" };

// Items identical in both versions.
const SQD0: SqdItem = { code: "sqd0", dimension: "Overall satisfaction", text: { en: "I am satisfied with the service that I availed." } };
const SQD1: SqdItem = { code: "sqd1", dimension: "Responsiveness", text: { en: "I spent a reasonable amount of time for my transaction." } };
const SQD2: SqdItem = {
  code: "sqd2",
  dimension: "Reliability",
  text: { en: "The office followed the transaction’s requirements and steps based on the information provided." },
};
const SQD3: SqdItem = {
  code: "sqd3",
  dimension: "Access and Facilities",
  text: { en: "The steps (including payment) I needed to do for my transaction were easy and simple." },
};
const SQD5: SqdItem = {
  code: "sqd5",
  dimension: "Costs",
  text: { en: "I paid a reasonable amount of fees for my transaction." },
  hint: { en: "(If service was free, mark the ‘N/A’ column)" },
};
const SQD8: SqdItem = {
  code: "sqd8",
  dimension: "Outcome",
  text: { en: "I got what I needed from the government office, or (if denied) denial of request was sufficiently explained to me." },
};

export const ARTA_CSM_2420_03_ONSITE: InstrumentDefinition = {
  code: "ARTA-2420-03-ONSITE",
  mode: "onsite",
  psaApprovalNo: "ARTA-2420-03",
  psaExpiry: "2025-07-31",
  approvedLanguages: ["en"],
  title: TITLE,
  intro: {
    en: "This Client Satisfaction Measurement (CSM) tracks the customer experience of government offices. Your feedback on your recently concluded transaction will help this office provide a better service. Personal information shared will be kept confidential and you always have the option to not answer this form.",
  },
  clientTypes: CLIENT_TYPES,
  ccDefinition: CC_DEFINITION,
  cc: [
    CC1,
    {
      code: "cc2",
      text: { en: "If aware of CC (answered 1-3 in CC1), would you say that the CC of this office was …?" },
      options: [
        { code: 1, label: { en: "Easy to see" } },
        { code: 2, label: { en: "Somewhat easy to see" } },
        { code: 3, label: { en: "Difficult to see" } },
        { code: 4, label: { en: "Not visible at all" } },
        { code: 5, label: { en: "Not Applicable" } },
      ],
    },
    {
      code: "cc3",
      text: { en: "If aware of CC (answered codes 1-3 in CC1), how much did the CC help you in your transaction?" },
      options: [
        { code: 1, label: { en: "Helped very much" } },
        { code: 2, label: { en: "Somewhat helped" } },
        { code: 3, label: { en: "Did not help" } },
        { code: 4, label: { en: "Not Applicable" } },
      ],
    },
  ],
  scale: SCALE,
  naLabel: { en: "N/A Not Applicable" },
  sqd: [
    SQD0,
    SQD1,
    SQD2,
    SQD3,
    {
      code: "sqd4",
      dimension: "Communication",
      text: { en: "I easily found information about my transaction from the office or its website." },
    },
    SQD5,
    {
      code: "sqd6",
      dimension: "Integrity",
      text: { en: "I feel the office was fair to everyone, or “walang palakasan”, during my transaction." },
    },
    {
      code: "sqd7",
      dimension: "Assurance",
      text: { en: "I was treated courteously by the staff, and (if asked for help) the staff was helpful." },
    },
    SQD8,
  ],
  suggestionLabel: SUGGESTION_LABEL,
  emailLabel: EMAIL_LABEL,
  thankYou: THANK_YOU,
};

export const ARTA_CSM_2420_03_ONLINE: InstrumentDefinition = {
  code: "ARTA-2420-03-ONLINE",
  mode: "online",
  psaApprovalNo: "ARTA-2420-03",
  psaExpiry: "2025-07-31",
  approvedLanguages: ["en"],
  title: TITLE,
  intro: {
    en: "This Client Satisfaction Measurement (CSM) tracks the customer experience of government offices. Your feedback on your recently concluded transaction will help this office provide a better service. Personal information shared will be kept confidential and you always have the option not to answer this form.",
  },
  clientTypes: CLIENT_TYPES,
  ccDefinition: CC_DEFINITION,
  cc: [
    CC1,
    {
      code: "cc2",
      text: { en: "If aware of CC (answered 1-3 in CC1), would you say that the CC of this office was …?" },
      options: [
        { code: 1, label: { en: "Easy to see" } },
        { code: 2, label: { en: "Somewhat easy to see" } },
        { code: 3, label: { en: "Difficult to see" } },
        { code: 4, label: { en: "Not visible at all" } },
        { code: 5, label: { en: "N/A" } },
      ],
    },
    {
      code: "cc3",
      text: { en: "If aware of CC (answered codes 1-3 in CC1), how much did the CC help you in your transaction?" },
      options: [
        { code: 1, label: { en: "Helped very much" } },
        { code: 2, label: { en: "Somewhat helped" } },
        { code: 3, label: { en: "Did not help" } },
        { code: 4, label: { en: "N/A" } },
      ],
    },
  ],
  scale: SCALE,
  naLabel: { en: "N/A Not Applicable" },
  sqd: [
    SQD0,
    SQD1,
    SQD2,
    SQD3,
    {
      code: "sqd4",
      dimension: "Communication",
      text: { en: "I easily found information about my transaction from the office’s website." },
    },
    SQD5,
    {
      code: "sqd6",
      dimension: "Integrity",
      text: { en: "I am confident my online transaction was secure." },
    },
    {
      code: "sqd7",
      dimension: "Assurance",
      text: { en: "The office's online support was available, and (if asked questions) online support was quick to respond." },
    },
    SQD8,
  ],
  suggestionLabel: SUGGESTION_LABEL,
  emailLabel: EMAIL_LABEL,
  thankYou: THANK_YOU,
};

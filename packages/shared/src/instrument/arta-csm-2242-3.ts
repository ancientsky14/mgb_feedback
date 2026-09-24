// ARTA Client Satisfaction Measurement Form, PSA Approval No. ARTA-2242-3 (expiry printed on the
// form: 31 July 2023). Transcribed word for word from MGB RO1's printed paper form
// (docs/CLIENT_FEEDBACK .pdf), the form the office still hands out.
//
// It predates ARTA-2420-03: it has **no SQD0** ("I am satisfied with the service that I availed"),
// no hint under SQD5, and prints "N/A" for the last CC2 and CC3 options. SQD0 is therefore stored
// as blank for these forms; blanks are not responses, so no score counts them.
//
// Retired from the start: it exists so paper forms are typed in against the version the client
// answered. Replace, never edit.

import type { InstrumentDefinition } from "./types";

export const ARTA_CSM_2242_3_ONSITE: InstrumentDefinition = {
  code: "ARTA-2242-3-ONSITE",
  mode: "onsite",
  psaApprovalNo: "ARTA-2242-3",
  psaExpiry: "2023-07-31",
  approvedLanguages: ["en"],
  title: { en: "HELP US SERVE YOU BETTER!" },
  intro: {
    en: "This Client Satisfaction Measurement (CSM) tracks the customer experience of government offices. Your feedback on your recently concluded transaction will help this office provide a better service. Personal information shared will be kept confidential and you always have the option to not answer this form.",
  },
  clientTypes: {
    citizen: { en: "Citizen" },
    business: { en: "Business" },
    government: { en: "Government (Employee or another agency)" },
  },
  ccDefinition: {
    en: "The Citizen’s Charter is an official document that reflects the services of a government agency/office including its requirements, fees, and processing times among others.",
  },
  cc: [
    {
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
    },
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
  scale: {
    1: { en: "Strongly Disagree" },
    2: { en: "Disagree" },
    3: { en: "Neither Agree nor Disagree" },
    4: { en: "Agree" },
    5: { en: "Strongly Agree" },
  },
  naLabel: { en: "N/A Not Applicable" },
  sqd: [
    { code: "sqd1", dimension: "Responsiveness", text: { en: "I spent a reasonable amount of time for my transaction." } },
    {
      code: "sqd2",
      dimension: "Reliability",
      text: { en: "The office followed the transaction’s requirements and steps based on the information provided." },
    },
    {
      code: "sqd3",
      dimension: "Access and Facilities",
      text: { en: "The steps (including payment) I needed to do for my transaction were easy and simple." },
    },
    {
      code: "sqd4",
      dimension: "Communication",
      text: { en: "I easily found information about my transaction from the office or its website." },
    },
    { code: "sqd5", dimension: "Costs", text: { en: "I paid a reasonable amount of fees for my transaction." } },
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
    {
      code: "sqd8",
      dimension: "Outcome",
      text: { en: "I got what I needed from the government office, or (if denied) denial of request was sufficiently explained to me." },
    },
  ],
  suggestionLabel: { en: "Suggestions on how we can further improve our services (optional):" },
  emailLabel: { en: "Email address (optional):" },
  thankYou: { en: "THANK YOU!" },
};

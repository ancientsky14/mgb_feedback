// Age brackets used in filed ARTA CSM reports' respondent tables.
export const AGE_BRACKETS = [
  { code: "le19", label: "19 or lower" },
  { code: "20_34", label: "20-34" },
  { code: "35_49", label: "35-49" },
  { code: "50_64", label: "50-64" },
  { code: "ge65", label: "65 or higher" },
  { code: "unspecified", label: "Did not specify" },
] as const;

export type AgeBracketCode = (typeof AGE_BRACKETS)[number]["code"];

export function ageBracket(age: number | null | undefined): AgeBracketCode {
  if (age === null || age === undefined || !Number.isInteger(age) || age <= 0) return "unspecified";
  if (age <= 19) return "le19";
  if (age <= 34) return "20_34";
  if (age <= 49) return "35_49";
  if (age <= 64) return "50_64";
  return "ge65";
}

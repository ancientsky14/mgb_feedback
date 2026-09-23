// "Region of residence" on the ARTA form is free text; offering the list keeps the data groupable.
// Includes the Negros Island Region re-established by RA 12000 (2024).
export const REGIONS = [
  { code: "NCR", name: "National Capital Region (NCR)" },
  { code: "CAR", name: "Cordillera Administrative Region (CAR)" },
  { code: "R01", name: "Region I – Ilocos Region" },
  { code: "R02", name: "Region II – Cagayan Valley" },
  { code: "R03", name: "Region III – Central Luzon" },
  { code: "R4A", name: "Region IV-A – CALABARZON" },
  { code: "R4B", name: "MIMAROPA Region" },
  { code: "R05", name: "Region V – Bicol Region" },
  { code: "R06", name: "Region VI – Western Visayas" },
  { code: "NIR", name: "Negros Island Region (NIR)" },
  { code: "R07", name: "Region VII – Central Visayas" },
  { code: "R08", name: "Region VIII – Eastern Visayas" },
  { code: "R09", name: "Region IX – Zamboanga Peninsula" },
  { code: "R10", name: "Region X – Northern Mindanao" },
  { code: "R11", name: "Region XI – Davao Region" },
  { code: "R12", name: "Region XII – SOCCSKSARGEN" },
  { code: "R13", name: "Region XIII – Caraga" },
  { code: "BARMM", name: "Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)" },
  { code: "ABROAD", name: "Outside the Philippines" },
] as const;

export type RegionCode = (typeof REGIONS)[number]["code"];
export const REGION_CODES = REGIONS.map((r) => r.code) as readonly RegionCode[];

export function regionName(code: string): string | undefined {
  return REGIONS.find((r) => r.code === code)?.name;
}

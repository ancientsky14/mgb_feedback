import type { Role } from "@feedback/shared";

export interface Me {
  email: string;
  displayName: string;
  role: Role;
  divisionId: number | null;
}

export interface DivisionRow {
  id: number;
  code: string;
  name: string;
  active: number;
}

export interface ServiceRow {
  id: number;
  division_id: number;
  cc_ref: string | null;
  name: string;
  name_fil: string | null;
  name_ilo: string | null;
  classification: "simple" | "complex" | "highly_technical" | null;
  processing_days: number | null;
  is_external: number;
  is_placeholder: number;
  active: number;
  sort_order: number;
}

export interface ServicePointRow {
  id: number;
  code: string;
  label: string;
  division_id: number | null;
  default_service_id: number | null;
  mode: "onsite" | "online";
  valid_from: string | null;
  valid_to: string | null;
  retired_at: string | null;
}

export interface InstrumentRow {
  code: string;
  mode: "onsite" | "online";
  psa_approval_no: string;
  psa_expiry: string | null;
  status: "draft" | "active" | "retired";
}

export interface Meta {
  divisions: DivisionRow[];
  services: ServiceRow[];
  servicePoints: ServicePointRow[];
  instruments: InstrumentRow[];
  settings: Record<string, string>;
}

export const canWrite = (me: Me) => me.role === "admin" || me.role === "cart";

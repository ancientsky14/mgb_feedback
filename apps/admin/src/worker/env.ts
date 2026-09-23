import type { Role } from "@feedback/shared";

export interface AdminEnv {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  /** Local development only; honoured for localhost requests alone. */
  DEV_AUTH_EMAIL?: string;
}

export interface Staff {
  email: string;
  displayName: string;
  role: Role;
  divisionId: number | null;
}

export type AdminHono = { Bindings: AdminEnv; Variables: { staff: Staff } };

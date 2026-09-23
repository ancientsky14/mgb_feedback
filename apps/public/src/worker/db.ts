import type { Channel, InstrumentMode, SqdCode } from "@feedback/shared";
import { SQD_CODES } from "@feedback/shared";

export interface ServicePointRow {
  id: number;
  code: string;
  label: string;
  division_id: number | null;
  default_service_id: number | null;
  mode: InstrumentMode;
}

/** A service point that is open today: not retired, and inside its validity dates if it has any. */
export function findServicePoint(db: D1Database, code: string, today: string): Promise<ServicePointRow | null> {
  return db
    .prepare(
      `SELECT id, code, label, division_id, default_service_id, mode
         FROM service_points
        WHERE code = ?1 AND retired_at IS NULL
          AND (valid_from IS NULL OR valid_from <= ?2)
          AND (valid_to IS NULL OR valid_to >= ?2)`,
    )
    .bind(code, today)
    .first<ServicePointRow>();
}

export async function activeInstrumentCode(db: D1Database, mode: InstrumentMode): Promise<string | null> {
  const row = await db
    .prepare(`SELECT code FROM instrument_versions WHERE mode = ?1 AND status = 'active'`)
    .bind(mode)
    .first<{ code: string }>();
  return row?.code ?? null;
}

export interface ServiceRow {
  id: number;
  name: string;
  name_fil: string | null;
  name_ilo: string | null;
}

/** The "service availed" choices at a service point: its division's services, or all of them. */
export async function servicesForPoint(db: D1Database, divisionId: number | null): Promise<ServiceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, name_fil, name_ilo
         FROM services
        WHERE active = 1 AND (?1 IS NULL OR division_id = ?1)
        ORDER BY sort_order, name`,
    )
    .bind(divisionId)
    .all<ServiceRow>();
  return results;
}

export async function isServiceOffered(db: D1Database, serviceId: number, divisionId: number | null): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM services WHERE id = ?1 AND active = 1 AND (?2 IS NULL OR division_id = ?2)`)
    .bind(serviceId, divisionId)
    .first<{ ok: number }>();
  return row !== null;
}

export async function refForSubmission(db: D1Database, submissionId: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT public_ref FROM responses WHERE submission_id = ?1`)
    .bind(submissionId)
    .first<{ public_ref: string }>();
  return row?.public_ref ?? null;
}

export async function intSetting(db: D1Database, key: string, fallback: number): Promise<number> {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first<{ value: string }>();
  const n = row ? Number.parseInt(row.value, 10) : Number.NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

/** Adds one to this key's count for the window and returns the new count, atomically. */
export async function bumpBucket(db: D1Database, key: string, windowStart: string): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO rate_buckets (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

export interface NewResponse {
  publicRef: string;
  submissionId: string;
  instrumentCode: string;
  serviceId: number;
  servicePointId: number;
  channel: Channel;
  lang: string;
  transactionDate: string;
  clientType: string;
  sex: string | null;
  age: number | null;
  region: string | null;
  cc1: number;
  cc2: number;
  cc3: number;
  sqd: Readonly<Record<SqdCode, number>>;
  suggestion: string | null;
  suspectBurst: boolean;
  submittedAt: string;
}

export interface NewContact {
  email: string;
  consentAt: string;
  purgeAfter: string;
}

/** Inserts the response and, if one was given, its contact row — both or neither (one D1 batch). */
export async function insertResponse(db: D1Database, r: NewResponse, contact: NewContact | null): Promise<void> {
  const statements = [
    db
      .prepare(
        `INSERT INTO responses (
           public_ref, submission_id, instrument_code, service_id, service_point_id, channel, lang,
           transaction_date, client_type, sex, age, region, cc1, cc2, cc3,
           sqd0, sqd1, sqd2, sqd3, sqd4, sqd5, sqd6, sqd7, sqd8,
           suggestion, suspect_burst, submitted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
                 ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)`,
      )
      .bind(
        r.publicRef,
        r.submissionId,
        r.instrumentCode,
        r.serviceId,
        r.servicePointId,
        r.channel,
        r.lang,
        r.transactionDate,
        r.clientType,
        r.sex,
        r.age,
        r.region,
        r.cc1,
        r.cc2,
        r.cc3,
        ...SQD_CODES.map((code) => r.sqd[code]),
        r.suggestion,
        r.suspectBurst ? 1 : 0,
        r.submittedAt,
      ),
  ];
  if (contact) {
    statements.push(
      db
        .prepare(
          `INSERT INTO response_contacts (response_id, email, consent_at, purge_after)
           SELECT id, ?2, ?3, ?4 FROM responses WHERE public_ref = ?1`,
        )
        .bind(r.publicRef, contact.email, contact.consentAt, contact.purgeAfter),
    );
  }
  await db.batch(statements);
}

import { addDays, manilaDate } from "@feedback/shared";
import { auditStatement } from "./audit";

/**
 * Daily at 07:00 Manila. Deletes contact details past their purge date (the promise made on the
 * form) and rate-limit counters older than a week. Records how many, never which.
 */
export async function runDailyPurge(db: D1Database, now: Date = new Date()): Promise<{ contacts: number; buckets: number }> {
  const today = manilaDate(now);
  const oldestBucket = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 13);
  const [contacts, buckets] = await db.batch([
    db.prepare(`DELETE FROM response_contacts WHERE purge_after < ?1`).bind(today),
    db.prepare(`DELETE FROM rate_buckets WHERE window_start < ?1`).bind(oldestBucket),
  ]);
  const result = { contacts: contacts?.meta.changes ?? 0, buckets: buckets?.meta.changes ?? 0 };
  await auditStatement(db, { actor: "system", action: "retention.daily_purge", detail: { ...result, today, next: addDays(today, 1) } }).run();
  return result;
}

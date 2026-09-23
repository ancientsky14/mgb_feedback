// Timestamps are stored in UTC. Anything a person reads as a date — transaction dates,
// report months, the fiscal year — is in Manila time, which is UTC+8 all year round.
// Without this, a response at 7:30 AM on 1 January would count toward the previous year.

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The calendar date in Manila at the given instant, as YYYY-MM-DD. */
export function manilaDate(at: Date = new Date()): string {
  return new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isIsoMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function utcNowIso(at: Date = new Date()): string {
  return at.toISOString();
}

/** Whether a client-reported transaction date is plausible: not in the future, not older than maxAgeDays. */
export function isAcceptableTransactionDate(date: string, today: string, maxAgeDays: number): boolean {
  return isIsoDate(date) && date <= today && date >= addDays(today, -maxAgeDays);
}

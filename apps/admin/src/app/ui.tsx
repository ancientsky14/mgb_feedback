import { formatPercent, type Rating } from "@feedback/shared";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { describeError } from "./api";

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-bold">{children}</h1>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-(--hairline) bg-(--surface) p-5 ${className}`}>
      {title && <h2 className="mb-3 text-base font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-emerald-800 text-white hover:bg-emerald-900 disabled:bg-slate-400",
    secondary: "border border-slate-400 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-60",
    danger: "bg-red-700 text-white hover:bg-red-800 disabled:bg-slate-400",
  };
  return <button type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${styles[variant]} ${className}`} {...props} />;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="my-3 rounded-lg border-2 border-red-700 bg-red-50 p-3 text-sm text-red-900">
      {describeError(error)}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  const styles = tone === "warning" ? "border-amber-600 bg-amber-50 text-amber-950" : "border-sky-700 bg-sky-50 text-sky-950";
  return <div className={`my-3 rounded-lg border-l-4 p-3 text-sm ${styles}`}>{children}</div>;
}

/** Stat tile: a label in sentence case, one value, an optional line of context. */
export function StatTile({ label, value, context }: { label: string; value: ReactNode; context?: ReactNode }) {
  return (
    <div className="rounded-xl border border-(--hairline) bg-(--surface) p-4">
      <p className="text-sm text-(--ink-2)">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {context && <div className="mt-1 text-sm text-(--ink-2)">{context}</div>}
    </div>
  );
}

const RATING_STATUS: Record<Rating, "good" | "warning" | "serious" | "critical"> = {
  Outstanding: "good",
  "Very Satisfactory": "good",
  Satisfactory: "warning",
  Fair: "serious",
  Poor: "critical",
};

/** An ARTA rating: text label plus a status icon; the colour never carries the meaning alone. */
export function RatingBadge({ rating }: { rating: Rating | null }) {
  if (!rating) return <span className="text-(--muted)">—</span>;
  const status = RATING_STATUS[rating];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <StatusIcon status={status} />
      <span>{rating}</span>
    </span>
  );
}

function StatusIcon({ status }: { status: "good" | "warning" | "serious" | "critical" }) {
  const color = `var(--status-${status})`;
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
      {status === "good" && (
        <>
          <circle cx="8" cy="8" r="7" fill={color} />
          <path d="M4.5 8.3l2.2 2.2 4.8-4.8" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {(status === "warning" || status === "serious") && (
        <>
          <path d="M8 1.5l7 12.5H1z" fill={color} />
          <path d="M8 6v4" stroke="#0b0b0b" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="12" r="0.9" fill="#0b0b0b" />
        </>
      )}
      {status === "critical" && (
        <>
          <circle cx="8" cy="8" r="7" fill={color} />
          <path d="M5.5 5.5l5 5m0-5l-5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export const pct = formatPercent;

export function int(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString("en-PH");
}

export const inputClass = "mt-1 block w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm";
export const labelClass = "block text-sm font-medium text-(--ink)";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-(--ink-2)">{hint}</span>}
    </label>
  );
}

/** YYYY-MM in Manila time, for default report periods. */
export function manilaMonth(offsetMonths = 0): string {
  const now = new Date(Date.now() + 8 * 3600_000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1));
  return d.toISOString().slice(0, 7);
}

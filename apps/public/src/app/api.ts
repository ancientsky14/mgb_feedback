import type { LanguageCode, Localized } from "@feedback/shared";

export interface FormContext {
  officeName: string;
  servicePoint: { code: string; label: string };
  instrumentCode: string;
  languages: LanguageCode[];
  services: { id: number; name: Localized }[];
  defaultServiceId: number | null;
  today: string;
  earliestTransactionDate: string;
  contactRetentionDays: number;
  turnstileSiteKey: string;
}

export type ContextResult = { ok: true; context: FormContext } | { ok: false; reason: "not_found" | "unavailable" | "network" };

export async function loadContext(code: string): Promise<ContextResult> {
  try {
    const res = await fetch(`/api/context/${encodeURIComponent(code)}`, { headers: { Accept: "application/json" } });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, context: (await res.json()) as FormContext };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export type SubmitResult =
  | { ok: true; publicRef: string }
  | { ok: false; reason: "invalid"; fields: Record<string, string[]> }
  | { ok: false; reason: "verification" | "form_changed" | "closed" | "rate_limited" | "network" | "server" };

/** Safe to call again with the same payload: the submissionId makes a retry return the first reference. */
export async function submitResponse(payload: unknown): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetch("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  const body = (await res.json().catch(() => ({}))) as { publicRef?: string; error?: string; fields?: Record<string, string[]> };
  if ((res.status === 200 || res.status === 201) && body.publicRef) return { ok: true, publicRef: body.publicRef };
  if (res.status === 400 && body.error === "invalid") return { ok: false, reason: "invalid", fields: body.fields ?? {} };
  if (res.status === 403) return { ok: false, reason: "verification" };
  if (res.status === 409) return { ok: false, reason: body.error === "form_changed" ? "form_changed" : "closed" };
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  return { ok: false, reason: "server" };
}

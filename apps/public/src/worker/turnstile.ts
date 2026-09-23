import { TURNSTILE_ACTION } from "@feedback/shared";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  ok: boolean;
  codes: string[];
}

export type VerifyTurnstile = (input: {
  secret: string;
  token: string;
  ip: string | null;
  expectedHostname: string;
}) => Promise<TurnstileResult>;

/**
 * Server-side Siteverify. Fails closed: a network error or timeout is a failed check, so a
 * Siteverify outage stops submissions rather than letting unverified ones through.
 */
export const verifyTurnstile: VerifyTurnstile = async ({ secret, token, ip, expectedHostname }) => {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  let data: { success?: boolean; hostname?: string; action?: string; "error-codes"?: string[] };
  try {
    const res = await fetch(SITEVERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, codes: [`http-${res.status}`] };
    data = await res.json();
  } catch {
    return { ok: false, codes: ["siteverify-unreachable"] };
  }
  if (data.success !== true) return { ok: false, codes: data["error-codes"] ?? ["not-success"] };
  if (expectedHostname && data.hostname !== expectedHostname) return { ok: false, codes: ["hostname-mismatch"] };
  // Test keys return an empty action; a real token carries the widget's action.
  if (data.action && data.action !== TURNSTILE_ACTION) return { ok: false, codes: ["action-mismatch"] };
  return { ok: true, codes: [] };
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; message?: string; fields?: Record<string, string[]> } & Record<string, unknown>,
  ) {
    super(body?.error ?? `Request failed (${status})`);
  }
}

/** Thrown when Cloudflare Access has ended the session: the request was bounced to its sign-in page. */
export class SessionEnded extends Error {}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      redirect: "manual",
      headers: init.body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new SessionEnded("The connection failed or your session ended.");
  }
  // Access answers an expired session with a redirect to its login page.
  if (res.type === "opaqueredirect" || res.status === 401) throw new SessionEnded("Your session ended.");
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

/** Plain-language message for an API error. */
export function describeError(err: unknown): string {
  if (err instanceof SessionEnded) return "Your session ended. Reload the page to sign in again.";
  if (err instanceof ApiError) {
    const known: Record<string, string> = {
      forbidden: "Your role cannot do this.",
      access_not_configured:
        "Sign-in is not set up on this deployment yet: ACCESS_TEAM_DOMAIN and ACCESS_AUD are empty. Set them and run npm run deploy:admin.",
      not_signed_in: "Your sign-in could not be verified. Reload the page; if it persists, the Access application's AUD tag does not match the configuration.",
      not_authorized: "Your email is not set up for this system. Ask the administrator to add you.",
      duplicate: "That already exists.",
      duplicate_control_no: "A paper form with this control number was already typed in this year.",
      last_admin: "This would leave the system without an active administrator.",
      invalid: "Some fields need checking.",
      invalid_period: "Check the period: the start must not be after the end.",
      rows_rejected: "Some rows could not be read. Review them, then accept them explicitly to import the rest.",
      has_warnings: "The sheet has warnings. Review them, then accept them explicitly to import.",
      row_errors: "Some rows have errors. Fix the sheet and upload it again.",
      missing_columns: "The file is missing required columns.",
      nothing_to_release: "There is no unreleased comment on this response.",
      already_excluded: "This response is already excluded from reports.",
      not_excluded: "This response is not excluded.",
    };
    return (err.body.error && known[err.body.error]) ?? err.body.message ?? `Something went wrong (${err.status}).`;
  }
  return "Something went wrong.";
}

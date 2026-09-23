import type { Role } from "@feedback/shared";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AdminEnv, AdminHono, Staff } from "./env";

// Sign-in is Cloudflare Access: there is no password here to guess. Access adds a signed JWT
// to every request it lets through; this code verifies it anyway, so an Access policy that
// was switched off or misconfigured leaves the admin API closed, not open.

const jwksByDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(teamDomain: string) {
  let set = jwksByDomain.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksByDomain.set(teamDomain, set);
  }
  return set;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type Identity = { ok: true; email: string } | { ok: false; status: 401 | 503; error: string };

export async function identify(request: Request, env: AdminEnv): Promise<Identity> {
  const url = new URL(request.url);
  // Local development: a fixed email, and only when the request itself is to localhost —
  // a deployed Worker is never reached under that hostname, so this cannot open it.
  if (env.DEV_AUTH_EMAIL && LOCAL_HOSTS.has(url.hostname)) return { ok: true, email: env.DEV_AUTH_EMAIL.toLowerCase() };

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return { ok: false, status: 503, error: "access_not_configured" };
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, status: 401, error: "not_signed_in" };
  try {
    const { payload } = await jwtVerify(token, jwks(env.ACCESS_TEAM_DOMAIN), {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email) return { ok: false, status: 401, error: "not_signed_in" };
    return { ok: true, email };
  } catch {
    return { ok: false, status: 401, error: "not_signed_in" };
  }
}

/** Signed in AND listed as active staff, or the request goes no further. */
export const authenticate: MiddlewareHandler<AdminHono> = async (c, next) => {
  const who = await identify(c.req.raw, c.env);
  if (!who.ok) return c.json({ error: who.error }, who.status);
  const row = await c.env.DB.prepare(
    `SELECT email, display_name, role, division_id FROM staff WHERE email = ?1 AND active = 1`,
  )
    .bind(who.email)
    .first<{ email: string; display_name: string; role: Role; division_id: number | null }>();
  if (!row) return c.json({ error: "not_authorized", email: who.email }, 403);
  const staff: Staff = { email: row.email, displayName: row.display_name, role: row.role, divisionId: row.division_id };
  c.set("staff", staff);
  await next();
};

/**
 * State-changing requests must come from this admin site's own pages. Access's sign-in cookie
 * would otherwise ride along on a forged form post from another site.
 */
export const sameOriginWrites: MiddlewareHandler<AdminHono> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (!origin || origin !== new URL(c.req.url).origin) return c.json({ error: "bad_origin" }, 403);
  }
  await next();
};

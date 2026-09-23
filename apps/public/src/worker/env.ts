/** Bindings and secrets. Secrets are set with `wrangler secret put` (DEPLOYMENT.md), locally in .dev.vars. */
export interface PublicEnv {
  DB: D1Database;
  SUBMIT_LIMITER?: RateLimit;
  READ_LIMITER?: RateLimit;
  OFFICE_NAME: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_EXPECTED_HOSTNAME: string;
  TURNSTILE_SECRET_KEY?: string;
  IP_HASH_SECRET?: string;
}

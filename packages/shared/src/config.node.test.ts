import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Both Workers and the database-command config must name the same D1 database, or the admin
// side would read a different database from the one the public form writes to.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const configs = ["db.wrangler.jsonc", "apps/public/wrangler.jsonc", "apps/admin/wrangler.jsonc"];

const read = (path: string) => readFileSync(`${root}${path}`, "utf8");
const field = (path: string, key: string) => new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(read(path))?.[1];
const routes = (path: string) => [...read(path).matchAll(/"pattern"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
const customDomains = (path: string) =>
  [...read(path).matchAll(/"pattern"\s*:\s*"([^"]+)"\s*,\s*"custom_domain"\s*:\s*true/g)].map((m) => m[1]);
const [, publicConfig, adminConfig] = configs as [string, string, string];

describe("Wrangler configuration", () => {
  it("points every config at one D1 database", () => {
    const ids = configs.map((path) => field(path, "database_id"));
    expect(ids.every((id) => id && id === ids[0]), `database_id values: ${ids.join(", ")}`).toBe(true);
  });

  it("pins one Cloudflare account in all three configs, once pinned at all", () => {
    // Before the office account's ID is known, none carry one (deploys are then blocked by
    // scripts/predeploy-check.mjs). Once any config has it, all three must agree.
    const ids = configs.map((path) => field(path, "account_id"));
    if (ids.every((id) => id === undefined)) return;
    expect(ids.every((id) => id && id === ids[0]), `account_id values: ${ids.join(", ")}`).toBe(true);
    expect(ids[0]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("keeps preview URLs off on both Workers", () => {
    for (const path of configs.slice(1)) expect(read(path)).toMatch(/"preview_urls"\s*:\s*false/);
  });

  // Access covers the staff side's one hostname and Turnstile the survey's: a second address
  // (workers.dev, a stray route) would be a way in neither of them guards.
  it("serves each Worker at exactly one address, its custom domain", () => {
    for (const path of [publicConfig, adminConfig]) {
      expect(read(path), path).toMatch(/"workers_dev"\s*:\s*false/);
      expect(routes(path), path).toHaveLength(1);
      expect(customDomains(path), path).toEqual(routes(path));
    }
    expect(customDomains(publicConfig)[0]).not.toBe(customDomains(adminConfig)[0]);
  });

  it("verifies Turnstile only for the survey's own address", () => {
    expect(field(publicConfig, "TURNSTILE_EXPECTED_HOSTNAME")).toBe(customDomains(publicConfig)[0]);
  });

  it("sends HSTS from both sites' static pages (the API sends Hono's, the same value)", () => {
    for (const app of ["public", "admin"]) {
      expect(read(`apps/${app}/public/_headers`)).toContain("Strict-Transport-Security: max-age=15552000; includeSubDomains");
    }
  });

  it("puts no secrets in the Worker configs", () => {
    for (const path of configs.slice(1)) {
      expect(read(path)).not.toMatch(/"(TURNSTILE_SECRET_KEY|IP_HASH_SECRET|DEV_AUTH_EMAIL)"\s*:/);
    }
  });
});

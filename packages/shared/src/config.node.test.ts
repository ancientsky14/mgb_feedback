import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Both Workers and the database-command config must name the same D1 database, or the admin
// side would read a different database from the one the public form writes to.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const configs = ["db.wrangler.jsonc", "apps/public/wrangler.jsonc", "apps/admin/wrangler.jsonc"];

const read = (path: string) => readFileSync(`${root}${path}`, "utf8");
const databaseId = (path: string) => /"database_id"\s*:\s*"([^"]+)"/.exec(read(path))?.[1];

describe("Wrangler configuration", () => {
  it("points every config at one D1 database", () => {
    const ids = configs.map(databaseId);
    expect(ids.every((id) => id && id === ids[0]), `database_id values: ${ids.join(", ")}`).toBe(true);
  });

  it("keeps preview URLs off on both Workers", () => {
    for (const path of configs.slice(1)) expect(read(path)).toMatch(/"preview_urls"\s*:\s*false/);
  });

  it("puts no secrets in the Worker configs", () => {
    for (const path of configs.slice(1)) {
      expect(read(path)).not.toMatch(/"(TURNSTILE_SECRET_KEY|IP_HASH_SECRET|DEV_AUTH_EMAIL)"\s*:/);
    }
  });
});

import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const migrationsDir = fileURLToPath(new URL("../../migrations", import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(migrationsDir),
          // Not Cloudflare's test keys: tests run on a non-localhost hostname, where those are refused.
          TURNSTILE_SITE_KEY: "0x4AAAAAAAtest-site-key",
          TURNSTILE_SECRET_KEY: "test-turnstile-secret",
          IP_HASH_SECRET: "test-ip-hash-secret",
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});

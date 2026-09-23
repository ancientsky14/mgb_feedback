// Stops a deploy that would go out half-configured. Run by `npm run deploy:public`,
// `npm run deploy:admin` and `npm run db:migrate:remote` before they touch Cloudflare.
//
//   node scripts/predeploy-check.mjs <public|admin|db>

import { readFileSync } from "node:fs";

const target = process.argv[2];
if (!["public", "admin", "db"].includes(target)) {
  console.error("Usage: node scripts/predeploy-check.mjs <public|admin|db>");
  process.exit(2);
}

const root = new URL("../", import.meta.url);
const CONFIGS = ["db.wrangler.jsonc", "apps/public/wrangler.jsonc", "apps/admin/wrangler.jsonc"];
const text = Object.fromEntries(CONFIGS.map((path) => [path, readFileSync(new URL(path, root), "utf8")]));
const value = (path, key) => new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(text[path])?.[1];

const PLACEHOLDER_DATABASE = "00000000-0000-4000-8000-000000000000";
const TURNSTILE_TEST_KEY = /^[123]x0{20,}[A-F]{2}$/; // Cloudflare's published test keys
const stop = [];
const warn = [];

function sameAcross(key, missingHelp) {
  const found = CONFIGS.map((path) => [path, value(path, key)]);
  const missing = found.filter(([, v]) => !v).map(([path]) => path);
  if (missing.length > 0) stop.push(`${key} is missing in ${missing.join(", ")}. ${missingHelp}`);
  else if (new Set(found.map(([, v]) => v)).size > 1) stop.push(`${key} differs between ${CONFIGS.join(", ")}.`);
  return found[0]?.[1];
}

sameAcross("account_id", "Sign Wrangler in to the mgbr1.fad account and pin its ID in all three configs (DEPLOYMENT.md step 0).");
const databaseId = sameAcross("database_id", "(DEPLOYMENT.md step 1).");
if (databaseId === PLACEHOLDER_DATABASE) {
  stop.push("database_id is still the placeholder: run `npx wrangler d1 create feedback --location apac` and paste the id into all three configs (DEPLOYMENT.md step 1).");
}

if (target === "public") {
  const config = "apps/public/wrangler.jsonc";
  const siteKey = value(config, "TURNSTILE_SITE_KEY") ?? "";
  if (!siteKey || TURNSTILE_TEST_KEY.test(siteKey)) {
    stop.push("TURNSTILE_SITE_KEY is empty or Cloudflare's test key: create the Turnstile widget and paste its site key (DEPLOYMENT.md step 2).");
  }
  if (!value(config, "TURNSTILE_EXPECTED_HOSTNAME")) {
    stop.push("TURNSTILE_EXPECTED_HOSTNAME is empty: set it to the public Worker's hostname (DEPLOYMENT.md step 2).");
  }
  warn.push("The secrets TURNSTILE_SECRET_KEY and IP_HASH_SECRET must be set (`npx wrangler secret put … --cwd apps/public`), or the survey refuses every submission.");
}

if (target === "admin") {
  const config = "apps/admin/wrangler.jsonc";
  if (!value(config, "ACCESS_TEAM_DOMAIN") || !value(config, "ACCESS_AUD")) {
    warn.push("ACCESS_TEAM_DOMAIN / ACCESS_AUD are empty. Fine for the first deploy, but the admin side refuses everyone until you enable Access, set both, and deploy again (DEPLOYMENT.md step 4).");
  }
}

for (const w of warn) console.warn(`! ${w}`);
if (stop.length > 0) {
  for (const s of stop) console.error(`x ${s}`);
  console.error(`\nNothing was deployed (${target}). Fix the items above and run it again.`);
  process.exit(1);
}
console.log(`ok: configuration checks passed for ${target}.`);

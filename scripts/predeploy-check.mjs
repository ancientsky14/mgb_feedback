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
const routePatterns = (path) => [...text[path].matchAll(/"pattern"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
const customDomains = (path) =>
  [...text[path].matchAll(/"pattern"\s*:\s*"([^"]+)"\s*,\s*"custom_domain"\s*:\s*true/g)].map((m) => m[1]);

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

sameAcross("account_id", "Pin the MGB ICT account's ID (`npx wrangler whoami` → Ict1@mgb.gov.ph's Account) in all three configs (DEPLOYMENT.md step 0).");
const databaseId = sameAcross("database_id", "(DEPLOYMENT.md step 1).");
if (databaseId === PLACEHOLDER_DATABASE) {
  stop.push("database_id is still the placeholder: run `npx wrangler d1 create feedback --location apac -c db.wrangler.jsonc` and paste the id into all three configs (DEPLOYMENT.md step 1).");
}

/** One address per Worker: its custom domain. A workers.dev copy would sit outside Access and Turnstile. */
function oneCustomDomain(config) {
  if (!/"workers_dev"\s*:\s*false/.test(text[config])) {
    stop.push(`${config}: set "workers_dev": false, so the Worker has no second address besides its custom domain.`);
  }
  const domains = customDomains(config);
  if (domains.length !== 1 || routePatterns(config).length !== 1) {
    stop.push(`${config}: needs exactly one route, a custom domain: "routes": [{ "pattern": "<host>", "custom_domain": true }].`);
    return undefined;
  }
  return domains[0];
}

if (target === "public") {
  const config = "apps/public/wrangler.jsonc";
  const domain = oneCustomDomain(config);
  const siteKey = value(config, "TURNSTILE_SITE_KEY") ?? "";
  if (!siteKey || TURNSTILE_TEST_KEY.test(siteKey)) {
    stop.push("TURNSTILE_SITE_KEY is empty or Cloudflare's test key: create the Turnstile widget and paste its site key (DEPLOYMENT.md step 2).");
  }
  const expected = value(config, "TURNSTILE_EXPECTED_HOSTNAME") ?? "";
  if (!expected) {
    stop.push("TURNSTILE_EXPECTED_HOSTNAME is empty: set it to the survey's custom domain (DEPLOYMENT.md step 2).");
  } else if (domain && expected !== domain) {
    stop.push(`TURNSTILE_EXPECTED_HOSTNAME is "${expected}" but the survey is served at "${domain}": every submission would be refused.`);
  }
  warn.push("The secrets TURNSTILE_SECRET_KEY and IP_HASH_SECRET must be set (DEPLOYMENT.md step 3), or the survey refuses every submission.");
}

if (target === "admin") {
  const config = "apps/admin/wrangler.jsonc";
  const domain = oneCustomDomain(config);
  const team = value(config, "ACCESS_TEAM_DOMAIN") ?? "";
  const aud = value(config, "ACCESS_AUD") ?? "";
  if (!team && !aud) {
    // On a custom domain the Access application is created before the first deploy, so the
    // staff side is never online, even as an empty shell, without its sign-in in front.
    stop.push(`ACCESS_TEAM_DOMAIN and ACCESS_AUD are empty: create the Access application for ${domain ?? "the admin custom domain"} first, put its team domain and AUD tag here, then deploy (DEPLOYMENT.md step 4).`);
  } else if (!team || !aud) {
    stop.push("Set both ACCESS_TEAM_DOMAIN and ACCESS_AUD, or neither: with only one, nobody can sign in.");
  } else {
    if (!/^(https:\/\/)?[a-z0-9-]+\.cloudflareaccess\.com\/?$/i.test(team)) {
      stop.push(`ACCESS_TEAM_DOMAIN "${team}" is not a team domain like https://<team>.cloudflareaccess.com.`);
    }
    if (!/^[0-9a-f]{64}$/.test(aud)) {
      stop.push("ACCESS_AUD is not a 64-character Application Audience tag (Zero Trust → Access → Applications → the application → Overview).");
    }
  }
}

for (const w of warn) console.warn(`! ${w}`);
if (stop.length > 0) {
  for (const s of stop) console.error(`x ${s}`);
  console.error(`\nNothing was deployed (${target}). Fix the items above and run it again.`);
  process.exit(1);
}
console.log(`ok: configuration checks passed for ${target}.`);

# AGENTS.md — MGB RO1 Client Feedback System

The canonical instructions for AI agents working in this repo. `CLAUDE.md` points here.
Read `.claude/PROJECT_MEMORY.md` first in a new session, then `.claude/ARCHITECTURE.md`.

## What this is

The ARTA Harmonized Client Satisfaction Measurement (CSM) for the Mines and Geosciences
Bureau Regional Office No. I, as a QR-code survey plus the staff side that produces the
annual ARTA CSM report. Two Cloudflare Workers sharing one D1 database:

- `apps/public` — the survey clients open from a QR code. No admin code at all.
- `apps/admin` — dashboards, the ARTA report, responses, paper-form entry, imports, setup.
  The whole Worker sits behind Cloudflare Access, and the code verifies the Access JWT too.
- `packages/shared` — the ARTA instrument, scoring, validation, report builder, importers.
  Pure TypeScript: it must run in Workers and browsers (no Node APIs outside `*.node.test.ts`).

## Hard rules

0. **This repository is public** (github.com/ancientsky14/mgb_feedback). Never commit secrets,
   office data (responses, tallies, filed reports, form exports), personal notes about anyone, or
   security details of any other system. `.claude/` files are public too.
1. **The user makes every git commit.** Never commit, push, or rewrite history.
2. **The user runs everything that touches Cloudflare**: `wrangler deploy`,
   `wrangler d1 migrations apply --remote`, `wrangler secret put`, `wrangler d1 execute --remote`,
   Access and Turnstile setup. End such work with a "Your steps" list instead.
3. **Migrations are append-only.** Never edit a file in `migrations/` once it may have been
   applied anywhere; add the next numbered file.
4. **The ARTA wording is never edited in place.** `packages/shared/src/instrument/` holds released
   versions verbatim. A wording change is a new version with a new code, and a migration row.
5. **Closed sets live twice, on purpose**: TypeScript constants in `packages/shared/src/constants.ts`
   and CHECK constraints in SQL. Change both together, and import the constants — never retype a
   status string.
6. **Do not guess office values.** Services, divisions, processing times, fees, SLAs and
   translations come from the office (CART, the DPO). Placeholders are marked `is_placeholder = 1`.
7. **Personal data stays minimal.** No IP addresses stored with responses; contact details only in
   `response_contacts` (hidden, audited on reveal, purged on schedule); never in exports, logs,
   alert emails or audit `detail`.
8. **Deny by default.** Admin API routes are registered only through `route()` in
   `apps/admin/src/worker/routes.ts`, with their roles. A test fails if any route bypasses it.

## Commands

```sh
npm install
npm test                 # all workspaces (shared unit tests + Worker integration tests)
npm run typecheck
npm run lint
npm run db:migrate:local # apply migrations to the shared local D1 (.wrangler/state)
npm run db:seed:local    # dev data: placeholder services, service points, dev admin
npm run dev:public       # http://localhost:5173/q/PACD01
npm run dev:admin        # http://localhost:5174 (signed in as DEV_AUTH_EMAIL, localhost only)
pwsh scripts/backup.ps1 -Local   # rehearse the verified backup against local data

# User-run only (they touch Cloudflare); each runs scripts/predeploy-check.mjs first:
npm run db:migrate:remote
npm run deploy:public
npm run deploy:admin
```

Before `dev`, copy each app's `.dev.vars.example` to `.dev.vars`.

## Conventions

- Timestamps are UTC ISO-8601 text; calendar dates and months are Manila dates (UTC+8, no DST).
- Percentages are integer hundredths (9607 = 96.07%), rounded half up with integer arithmetic.
- SQD answers: 1–5, 0 = N/A, NULL = blank (paper only). CC answers use ARTA's option codes.
- Tests that pass on the first run prove little: for a guard, break it once and watch a test fail.
- D1 on the Free plan allows 50 queries per request: aggregate in SQL or in `buildReport`, never
  query per row. Bulk inserts use `INSERT … SELECT … FROM json_each(?)` (100 bound parameters max).

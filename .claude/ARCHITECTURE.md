# Architecture — MGB RO1 Client Feedback System

Keep this short. Code is the source of truth; this is the map. Hard rules are in `AGENTS.md`.

## Stack

TypeScript 6, Hono 4, zod 4, React 19 + Vite 8 + Tailwind 4, TanStack Query (admin), `qrcode`
(posters), `jose` (Access JWT). Cloudflare Workers with static assets via `@cloudflare/vite-plugin`,
one D1 database. Tests: Vitest 4 (shared, Node) and `@cloudflare/vitest-plugin` (Workers, real
workerd + local D1). Vitest stays on 4.1.x: the Workers test plugin does not support 5 yet.

## How the pieces fit

- **Two Workers, one D1.** `apps/public` serves the survey and three endpoints
  (`/api/context/:code`, `POST /api/responses`). `apps/admin` serves the staff side; the whole
  Worker is behind Cloudflare Access and `auth.ts` verifies `Cf-Access-Jwt-Assertion` (issuer +
  audience) before looking the email up in `staff`. Both bind the same database; local dev shares
  `.wrangler/state` at the repo root (`persistState` in both Vite configs, and `db.wrangler.jsonc`).
- **The instrument lives in code** (`packages/shared/src/instrument/`), verbatim per ARTA version
  (on-site and online wording differ for SQD4, SQD6, SQD7). `instrument_versions` rows only say
  which version is active per mode. A service point's `mode` picks the version.
- **One report implementation.** `buildReport` (shared) turns response rows + legacy tallies +
  transaction counts into the ARTA tables; `loadReport` (admin) only runs the four queries in one
  D1 batch. `suppressSmallGroups` applies the division-focal anonymity rules.
- **Guards sit where they cannot be skipped:** UNIQUE `submission_id` (retries are idempotent),
  triggers (responses cannot be deleted except replaced import rows; online answers cannot be
  changed; audit log append-only), CHECK constraints for every closed set, `route()` for roles.
- **Public submission path:** rate-limit binding (flood brake) → zod → idempotency check (before
  Turnstile: a retry carries a spent token) → Siteverify (fails closed) → service point / version /
  service / date checks → D1 hourly cap on an HMAC of the IP → insert response (+ contact) in one
  batch.
- **Imports** re-parse the file at commit (never trust the preview), refuse partial imports without
  explicit acceptance, and replace a batch atomically (`batchHeader` in `api/imports.ts`).
- **Daily cron** (admin, 07:00 Manila) purges expired contact details and old rate buckets.

## Where things live

- `migrations/NNNN_*.sql` — append-only schema. `seeds/dev.sql` — local placeholders only.
- `packages/shared/src/` — `constants`, `instrument/`, `scoring`, `report`, `submission`,
  `import-online`, `import-tally`, `csv` (export escaping), `csv-parse`, `ids`, `time`.
- `apps/public/src/worker/` — `app.ts` (routes), `db.ts`, `turnstile.ts`, `ip.ts`.
  `apps/public/src/app/` — the survey (`survey/Survey.tsx`), privacy notice, landing page.
- `apps/admin/src/worker/` — `auth.ts`, `routes.ts`, `report-data.ts`, `api/*.ts`, `scheduled.ts`.
  `apps/admin/src/app/pages/` — one file per screen.
- `scripts/backup.ps1` — verified backup (export → restore → compare counts).

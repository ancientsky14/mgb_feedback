# Project Memory — MGB RO1 Client Feedback System

Durable facts. Read this first in a new session. Update it when something here goes stale.

## What this project is

A digital ARTA Harmonized Client Satisfaction Measurement (CSM) for MGB Region I: QR-code
survey, paper-form entry, imports of pre-go-live records, and the staff side that produces the
annual ARTA CSM report (due to ARTA by the last working day of January). Later phases add CART's
complaint register (incl. 8888 / CCB / ARTA referrals) and confidential integrity reports.

The roadmap it implements: `docs/roadmap.md` (Phases 0–4, as approved on 2026-09-23). The
management proposal for the RD, CART and DPO is a Claude doc:
<https://claude.ai/artifact/SwnJs7KwaTzRpXCGZBch4U> (opens only for people it is shared with).

Repository: <https://github.com/ancientsky14/mgb_feedback> — **public**. See the hard rule in
`AGENTS.md` about what may never be committed. CI (lint, typecheck, tests) runs on every push.

Deployment target: the **mgbr1.fad** Cloudflare account (FAD's office login), pilot on
workers.dev. Deploy only through `npm run deploy:public|admin` and `npm run db:migrate:remote`,
which refuse to run while configs still hold placeholders or test keys (`scripts/predeploy-check.mjs`).

## Current state (2026-09-23)

Phase 1 (ARTA CSM core) is built and tested locally; **nothing is deployed**, no Cloudflare
account is set up, and no office data has been loaded.

- Public survey, admin side, reports, paper entry, imports, QR posters, backups: implemented.
- 179 tests pass (shared 122, admin 30, public 27); typecheck and lint clean; both Workers
  build and dry-run deploy.
- Verified end to end against local D1: a real submission through the dev server (live
  Siteverify with Cloudflare's test keys), idempotent retry, admin dashboard and CSV export.
- **Not verified**: the two UIs in a real browser (no browser automation was available), a real
  Access sign-in, a real Turnstile widget, phone/in-app-browser behaviour, accessibility audit.

## Key facts worth remembering

- The office collects the CSM on **paper and online** today. Recommended switch: parallel pilot
  in Q4 2026, go-live **1 January 2027** (never switch methods mid-year).
- The built-in ARTA form is PSA approval **ARTA-2420-03, printed expiry 31 July 2025** — the
  dashboard warns about it. Get the version in force from ARTA via CART; add it as a new instrument
  file + migration row, never by editing the old one.
- Scoring was matched against a filed report (PRA FY2025 CSM Report): per-item and per-service
  overall = (SA + A) ÷ (responses − N/A), overall pools SQD1–8, bands at two decimals. How the
  **office-wide** score is stated (pooled vs mean of services) varies by agency — setting
  `office_overall_method`; confirm against MGB RO1's own last filed report (the golden test).
- Services and divisions in `seeds/dev.sql` are **placeholders** (`is_placeholder = 1`). The real
  list comes from the office's Citizen's Charter via CART.
- English only for now: Filipino/Ilocano appear once a vetted translation is added to the
  instrument's `approvedLanguages`.
- Continuity lives in these files: a new session cannot see earlier chats, so record decisions
  and state here rather than assuming them. The owner commits and deploys (see `AGENTS.md`).
- On this PC the Bash tool fails on the space in the Windows user folder; use PowerShell or the
  lean-ctx shell. `wrangler d1 export` has no `--persist-to`: local database commands go through
  `db.wrangler.jsonc`, whose default local state is the shared `.wrangler/state`.

## Known gaps / waiting on the office

See `TODOS.md` → "Phase 0". The biggest: the Citizen's Charter services list, last year's filed
CSM report with its raw tallies (for the golden test), samples of the paper tally sheet and the
online form's CSV export (to pin the importers), the DPO's PIA and retention periods, an
office-owned Cloudflare account, and a web address MGB controls.

## See also

- `../docs/roadmap.md` — Phases 0–4, as approved
- `DECISIONS.md` — why things are built the way they are
- `ARCHITECTURE.md` — how the pieces fit
- `TODOS.md` — open work
- `session-notes/` — the day-by-day log
- `../DEPLOYMENT.md` — the steps only the user runs

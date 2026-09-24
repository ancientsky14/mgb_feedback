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

Deployment target: **`Ict1@mgb.gov.ph`'s Account** (MGB ICT, `b299efc33bdc0c0dea89e9076f87586c`),
reached through FAD's member login. Survey `https://feedback.onemgb.com` (Worker `feedback`), staff
side `https://feedback-admin.onemgb.com` (Worker `feedback-admin`, behind ICT's Access team). D1
`feedback` (APAC). Custom domains only; workers.dev is off. Deploy only through
`npm run deploy:public|admin` and `npm run db:migrate:remote`, which refuse to run while configs are
incomplete or inconsistent (`scripts/predeploy-check.mjs`). Full steps: `DEPLOYMENT.md`.

## Current state (2026-09-24)

**Moving to the MGB ICT account** (`Ict1@mgb.gov.ph`'s Account, `b299efc33bdc0c0dea89e9076f87586c`)
at `feedback.onemgb.com` (survey) and `feedback-admin.onemgb.com` (staff side, behind Access). FAD
deploys with its member login (`mgbr1.fad@gmail.com`), which also reaches FAD's old account: the
pinned `account_id` decides. Fresh database; the old pilot (FAD account, workers.dev) is retired
afterwards. Archive of the old pilot database: `C:\feedback-backups\archive-mgbr1-fad` (staff tests only).

- Configs carry the ICT account, its D1 (`1088eb82-…`, APAC, migrations 0001–0003), the custom
  domains, `workers_dev: false`, the ICT Turnstile site key and the Access values of Zero Trust team
  `onemgb` (created by FAD's member login on 2026-09-24). The survey is live on the ICT account
  (secrets set, workers.dev answers 1042); the staff side is ready to deploy.
- The office network blocks new, unrated domains, so test onemgb.com hosts from mobile data until
  FortiGuard has rated onemgb.com (rating requested 2026-09-24).
- 234 tests pass (shared 148, admin 43, public 31 Worker + 12 UI/axe); typecheck and lint clean.
- The earlier staff pilot on workers.dev verified Access sign-in, Turnstile, a real submission, the
  staff-side views and exports, and phones. Lighthouse mobile: performance 97, accessibility 100.
- Live gotchas found in the pilot: Turnstile needs `Referrer-Policy: strict-origin` (not
  `no-referrer`, error 110200); a secret piped into `wrangler secret put` can save empty — use
  `wrangler secret bulk` from a temp JSON, then probe `POST /api/responses` with `{}` (400 = ok).
- The office's paper form is **ARTA-2242-3 (expired 31 July 2023), with no SQD0**; it is in code as
  the retired version `ARTA-2242-3-ONSITE` (migration 0003) for paper entry. Look SQD items up with
  `sqdItem(instrument, code)`, never by array position.

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
online form's CSV export (to pin the importers), the DPO's PIA and retention periods, the RD's
approval, and ICT's Zero Trust team for the staff side's sign-in.

## See also

- `../docs/roadmap.md` — Phases 0–4, as approved
- `DECISIONS.md` — why things are built the way they are
- `ARCHITECTURE.md` — how the pieces fit
- `TODOS.md` — open work
- `session-notes/` — the day-by-day log
- `../DEPLOYMENT.md` — the steps only the user runs

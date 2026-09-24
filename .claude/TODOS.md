# TODOs — MGB RO1 Client Feedback System

Check the code before trusting this list.

## Phase 0 — waiting on the office (requested through the proposal doc)

- [ ] RD: approval of the Q4 2026 pilot; memo naming the system owner (CART or PACD officer).
- [ ] CART: Citizen's Charter external services, processing times, fees → enter under Services.
- [ ] CART: complaint response periods and alert recipients (for Phase 2).
- [ ] CART: last year's filed CSM report **and its raw tallies** → the golden test.
- [ ] CART: a blank paper form, a filled tally sheet, and a CSV export of the current online form →
      tune `HEADER_RULES` / answer mapping and pin them in tests.
- [ ] CART/ARTA: the current CSM form version and approved translations (Filipino, Ilocano).
- [ ] CART: confirm MGB Central Office / DENR do not already require a central CSM system.
- [ ] DPO: Privacy Impact Assessment, final privacy notice (replace the draft in `Privacy.tsx`),
      retention periods, advice on hosting outside the Philippines.
- [x] Office-owned Cloudflare account: `Ict1@mgb.gov.ph`'s Account (MGB ICT); FAD is a member.
- [x] Zero Trust team `onemgb` and the Access application for `feedback-admin.onemgb.com` (2026-09-24).
- [ ] Turn on 2FA for the FAD member login (it holds broad rights in ICT's account).
- [ ] ICT: keep `onemgb.com` registered to MGB, on auto-renew and registrar-locked (QR codes depend on it).
- [ ] ICT: let `feedback.onemgb.com` and `feedback-admin.onemgb.com` through the office network (new
      domains arrive "unrated"), and have `onemgb.com` categorized with web-filter vendors, before any
      QR code is printed.
- [x] Web address under an MGB-controlled domain: `feedback.onemgb.com`.

## Phase 1 — left to do

- [ ] Golden test: import FY2025 data through the real importers; the generated report must equal
      the filed FY2025 report. Decide `office_overall_method` from it.
- [x] Survey accessibility: axe WCAG 2.2 AA tests per step (`apps/public/test-ui/`, jsdom);
      Lighthouse mobile on the live survey 2026-09-24: performance 97, accessibility 100.
- [ ] Look at the survey on a mid-range Android phone and in the Messenger / QR-scanner in-app
      browsers (staff pilot phones passed 2026-09-24; re-check after each UI change).
- [x] XLSX export of the ARTA report (`/api/reports/csm.xlsx`, shared rows with the CSVs).
- [x] Exclude responses from reports (migration 0002): staff pilot test submissions must be
      excluded ("Staff test") on the live system after migrating.
- [x] Wrangler signed in as mgbr1.fad → pin `account_id` in the three configs.
- [x] Deploy the staff-only pilot (mgbr1.fad account, workers.dev), 2026-09-24.
- [ ] Move to the ICT account (DEPLOYMENT.md): survey side, then staff side once Access exists.
- [ ] Retire the old FAD account's Workers, D1, Turnstile widget and Access app after the move.
- [ ] First restore drill and schedule `scripts/backup.ps1` nightly.
- [x] Paper form in use is **ARTA-2242-3 (expired 31 July 2023)** and has **no SQD0**: added as
      retired version `ARTA-2242-3-ONSITE` (migration 0003); paper entry blanks SQD0 for it.
- [ ] Confirm with CART which CSM version ARTA currently requires (ARTA-2242-3 and ARTA-2420-03
      have both expired), and have the office print that one.
- [ ] Pilot at the PACD (Q4 2026) alongside the current method; reconcile counts.

## Phase 2 — integrity and case register

- [ ] MGB supplement (4 optional questions, CART-approved wording), confidential flags, alert email
      (send_email binding to verified addresses; Email Routing on a zone).
- [ ] Case register: intake for walk-in/letter/email/8888/CCB/ARTA; state machine; due dates;
      overdue digest; public status page by reference (rate-limited, whitelisted fields).
- [ ] Thank-you page: ARTA / 8888 / CCB contacts from the office's Citizen's Charter.

## Phase 3 — coverage and data quality

- [ ] Single-use survey tokens issued at counters (`responses.token_id`, partial UNIQUE index).
- [ ] Kiosk mode (device token, reset after submit/idle); paper spot-check workflow.
- [ ] Online-version instrument in use for online transactions; event service points.

## Phase 4 — analytics

- [ ] Trends; division comparisons (n < 5 hidden); theme tags on comments; quarterly packs.
- [ ] Likert distribution chart (diverging stacked bar) — load the dataviz skill first.

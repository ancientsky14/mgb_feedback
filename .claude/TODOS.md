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
- [ ] FAD: an office-owned email for the Cloudflare account; two named administrators.
- [ ] IT/web admin: a web address under an MGB-controlled domain (or a redirect).

## Phase 1 — left to do

- [ ] Golden test: import FY2025 data through the real importers; the generated report must equal
      the filed FY2025 report. Decide `office_overall_method` from it.
- [ ] Look at both UIs in a real browser and on a mid-range Android phone (Messenger and QR-scanner
      in-app browsers); axe/WCAG 2.2 AA pass; Lighthouse on slow 4G.
- [ ] XLSX export of the ARTA report (CSV and print-to-PDF exist).
- [ ] Deploy per `DEPLOYMENT.md`; first restore drill; schedule `scripts/backup.ps1`.
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

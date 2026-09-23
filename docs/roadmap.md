# Roadmap — MGB RO1 Client Feedback System

The plan as approved on 2026-09-23. Where the build differs, the code and
`.claude/DECISIONS.md` win. For example, the ARTA wording lives in code rather than in the
database, and the admin UI uses plain Tailwind (no shadcn, recharts or exceljs yet).

## Purpose

To be the office's single system for:

1. the **ARTA Harmonized CSM** (annual report to ARTA, due by the last working day of January);
2. **CART's complaint register**, including referrals from 8888, CCB and ARTA; and
3. **confidential integrity reports** (fixers, extra fees), anonymous by default.

The office collects the CSM on paper **and** online today, so Phase 1 includes paper encoding
and importers, and the switch happens at a fiscal-year boundary (see Phases).

## Design principles (and the mistakes they avoid)

| # | Tempting design | Problem | This system |
|---|---|---|---|
| 1 | A home-made questionnaire (stars, custom ratings, yes/no items) | ARTA's CSM (MC 2022-05, amended by MC 2023-05) is fixed, so custom items can't fill the ARTA report | The ARTA CSM word for word: profile, CC1–CC3, SQD0–SQD8 (5-point + N/A, emoticons). MGB's own questions go in a separate optional block after the core |
| 2 | One form for everyone | ARTA publishes **On-Site** and **Online** versions; SQD4, SQD6 and SQD7 differ. A QR scan after an in-person transaction needs the **On-Site** wording, even on a phone | Each instrument version has a `mode` and records its PSA approval no. and expiry. The service point decides which version is shown |
| 3 | Averages like "4.46/5" | Not ARTA metrics | (Strongly Agree + Agree) ÷ (responses − N/A), per SQD and overall; ARTA's rating bands |
| 4 | Response rate from day one | No transaction count to divide by | Phase 1: CART enters monthly transaction counts. Phase 3: counts come from single-use survey tokens |
| 5 | "Anonymous" **and** transaction-linked QR slips | Contradictory; a linked slip identifies the client, which is dangerous for fixer or bribery reports | Tokens carry only service, service point and date. Contact details are opt-in, kept in their own table, and every reveal is audited |
| 6 | Divisions see their own complaints | Integrity reports would reach the division being reported | Integrity flags go to CART only. Divisions see aggregates (groups under 5 hidden) and only comments CART releases |
| 7 | Complaints only from the survey | CART must also act on complaints referred by 8888, CCB and ARTA within set periods | The case register takes manual intake (walk-in, letter, email, 8888, CCB, ARTA) and tracks due dates |
| 8 | QR codes with readable parameters on a made-up domain | Parameters can be edited; a printed QR is permanent | A QR encodes `https://<MGB-controlled domain>/q/<opaque code>`, resolved on the server. The readable URL is printed under the QR. No permanent posters until the domain is final |
| 9 | Sequential public IDs | Anyone can guess other people's IDs | Random 12-character public references; lookups rate-limited |
| 10 | Phones only | Excludes clients without a smartphone or data, and ignores the paper and online CSM already running | Own phone, paper forms (typed in with control numbers) and imported legacy data in Phase 1; kiosk and online link in Phase 3. The channel is recorded; bursts are flagged |
| 11 | Compliance later | The ARTA CSM *is* the required output | Phase 1 = ARTA core + report. Integrity questions and the case register = Phase 2 |
| 12 | Privacy as a notice only | NPC Circular 2023-06 requires a Privacy Impact Assessment and DPO involvement | Phase 0: PIA, privacy notice, retention schedule. No IP addresses stored with responses |

## Architecture

```
phone / kiosk / staff encoder ──► https://<domain>/q/<code>
                                        │
                     feedback-public Worker (Vite React form + Hono API)
                     Turnstile Siteverify · zod · rate-limit binding · D1 caps
                                        │
                                        ▼
                     D1 (SQLite, location hint apac) ◄── cron: purges (digests, SLA later)
                                        ▲
                     feedback-admin Worker (Vite React dashboard + Hono API)
                     whole Worker behind Cloudflare Access + JWT check in code
```

Why Cloudflare Workers + D1:

- **Sign-in is Cloudflare Access**, so the app has no password endpoint of its own to attack.
- **The client IP is set by Cloudflare's edge**, so rate limits can't be dodged with a forged
  header, and D1-backed counters persist across instances.
- **No inactivity pause.** A printed QR landing on a paused free-tier project after a long holiday
  would be a public failure.
- **Two Workers.** On workers.dev, Access protects a whole Worker, so path matching can't be gotten
  wrong, and the public Worker contains no admin code.
- **Cost: $0 at this volume.** D1 Free: 500 MB database, 7-day Time Travel, 50 queries per request.

## The instrument

- **ARTA core, exact text per version.** Profile (client type, date, sex, age, region, service),
  CC1–CC3 (option 4 on CC1 makes CC2/CC3 N/A), SQD0–SQD8 with emoticons and text labels, optional
  suggestions and email.
- **MGB supplement (Phase 2)**, optional, CART-approved wording, at most four items: requirements
  not in the Citizen's Charter; fees above the official amount or without a receipt; fixers;
  completion within the Charter's processing time. Any "Yes" is a confidential flag for CART — a
  report to review, not a finding.
- **Rules.** Versions are never edited once active. Core answers are fixed columns; supplement
  answers one row each. SQD: 1–5, 0 = N/A, NULL = blank (paper only). Languages appear once a vetted
  translation exists. Turnstile runs on the last step. The public page stays under 100 KB of
  compressed JavaScript.

## Security and privacy

- **Public Worker:** Siteverify on every submission (fails closed), strict zod validation,
  idempotent retries, per-minute flood brake plus hourly caps on an HMAC of the IP (never the IP),
  no IP or fingerprint stored, no public file uploads.
- **Admin Worker:** Access with named emails; JWT verified in code; deny-by-default roles (`admin`,
  `cart`, `division_focal`, `management`); contact details hidden and every reveal audited; exports
  neutralize formula injection and never include contact details; append-only audit log; responses
  cannot be deleted.
- **Data:** UTC timestamps, Manila dates in reports; contact details purged on schedule; nightly
  verified backups (export → restore → compare counts); an office-owned Cloudflare account with
  at least two admins.

## Phases

**Timeline:** parallel pilot in Q4 2026 (the current method stays the official FY2026 record);
go-live 1 January 2027. Never switch methods in the middle of a reporting year.

**Phase 0 — prerequisites (from the office).** Samples of today's data (paper tally workbook,
blank form, online-form CSV export); sponsor memo naming the system owner; the current ARTA form
version and translations; Citizen's Charter services, processing times and fees; complaint SLAs
and alert recipients; last year's filed CSM report and raw tallies; confirmation that no central
MGB/DENR CSM system is required; the DPO's PIA, notice, retention periods and hosting advice; a web
address MGB controls; an office-owned Cloudflare account.

**Phase 1 — ARTA CSM core (built).** Shared scoring and report logic; the survey; the admin side
(dashboard, ARTA report, responses, paper entry, imports, QR posters, setup, staff, audit);
verified backups. Exit: the golden report test passes, and the Q4 pilot reconciles with the
current method.

**Phase 2 — integrity and case register.** The MGB supplement, flags and alerts, CART triage,
releasing comments to divisions; case intake for all referral sources, a state machine
(NEW → ACKNOWLEDGED → UNDER_REVIEW → REFERRED → ACTION_TAKEN → RESOLVED, plus CLOSED_NO_ACTION and
REOPENED), due dates and an overdue digest; a public status page by reference.

**Phase 3 — coverage and data quality.** Single-use counter tokens, kiosk mode, paper
spot-checks, the online instrument for online transactions, event service points.

**Phase 4 — analytics.** Trends, division comparisons (small groups hidden), comment themes,
quarterly packs, an ISO 9001 §9.1.2 / §10.2 evidence export if the IMS audit uses it. AI summaries
only after the PIA covers sending comment text to a provider.

## Verification

- Unit tests for scoring (against a filed agency report), validation, importers and the report.
- **Golden test:** FY2025's data through the real importers must reproduce the **filed** FY2025
  CSM report exactly.
- Worker integration tests against a local D1: submissions, retries, Turnstile failures, rate
  caps, role enforcement, forged tokens, database guards.
- Manual: phones and in-app browsers, WCAG 2.2 AA, a printed poster scanned at counter distance
  (QR about 1/10 of the scanning distance wide), a restore drill before go-live.

## Sources

- [ARTA MC 2022-05](https://arta.gov.ph/wp-content/uploads/2022/09/MC-2022-05-GUIDELINES-ON-THE-IMPLEMENTATION-OF-THE-HARMONIZED-CLIENT-SATISFACTION-MEASUREMENT.pdf)
- [ARTA MC 2023-05](https://www.arta.gov.ph/wp-content/uploads/2023/06/MC-2023-05_Amendment-to-CSM-1-1.pdf)
- [CSM report outline (Annex B)](https://www.arta.gov.ph/wp-content/uploads/2022/10/ARTA-MC-2022-05_Annex-B_CSM-Report-Outline.pdf)
- [CSM form, on-site and online versions](https://www.da.gov.ph/wp-content/uploads/2025/07/ARTA-Client-Satisfaction-Survey-2025.pdf)
- [NPC Circular 2023-06](https://privacy.gov.ph/wp-content/uploads/2024/03/NPC-Circular-Repeal-16-01-Signed.pdf)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

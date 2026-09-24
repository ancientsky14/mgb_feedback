# Decisions — MGB RO1 Client Feedback System

Append-only. Don't delete superseded entries; add a new one that links back.

## 2026-09-23 — Cloudflare Workers + D1, not Next.js + Supabase

**Decision:** Two Cloudflare Workers (public survey, admin) sharing one D1 database; admin behind
Cloudflare Access. Confirmed with the user.
**Why:** Cloudflare Access handles sign-in, so the app has no password endpoint of its own to
attack. On Workers the client IP (`CF-Connecting-IP`) is set by Cloudflare's edge, so rate limits
cannot be dodged with a forged header, and D1-backed counters persist across instances. No
inactivity pause — a printed QR landing on a paused project after a long holiday is a public
failure. $0 at this volume. D1 was rightly rejected for eBudget (read-then-decide balance guards
from a desktop client over HTTP); here the Worker *is* the server and the only concurrency guards
needed are UNIQUE constraints and conditional updates.
**Status:** active

## 2026-09-23 — Two Workers, not one with path-based Access

**Decision:** The admin side is a separate Worker, entirely behind Access; the public Worker has no
admin code. Preview URLs are off on both.
**Why:** On workers.dev, Access protects a whole Worker, so path matching can't be gotten wrong.
A preview URL would be an unprotected second way into the admin Worker.
**Status:** active

## 2026-09-23 — The ARTA wording lives in code; the database records only which version is active

**Decision:** `packages/shared/src/instrument/` holds each released ARTA version verbatim
(on-site and online); `instrument_versions` holds code, mode, PSA number/expiry and status.
**Why:** The wording is reviewed like code and never edited in place; a response keeps the exact
version it answered. A copy in the database as well would be a second source of truth.
**Status:** active

## 2026-09-23 — Scoring rules, matched against a filed agency report

**Decision:** Item score = (SA + A) ÷ (answers − N/A); blanks are not answers. Service overall =
the same over SQD1–SQD8 pooled; SQD0 reported separately. Ratings applied to the score rounded to
two decimals (Poor < 60.00 ≤ Fair < 80.00 ≤ Satisfactory < 90.00 ≤ Very Satisfactory < 95.00 ≤
Outstanding). CC awareness = CC1 options 1–3 over CC1 1–4; visibility = CC2 option 1 over CC2 1–4;
helpfulness = CC3 option 1 over CC3 1–3; paper answers kept as written even when inconsistent.
Integer-hundredths arithmetic, half up.
**Why:** Reproduces every figure checked in the PRA FY2025 CSM Report (which follows ARTA MC
2022-05/2023-05), e.g. 708/737 = 96.07% and CC2 262/297 = 88.22%. The ARTA circular itself could
not be opened from here (the site blocks automated reading).
**Open:** the office-wide score — PRA reports a mean of per-service scores at office level; the
formula as written is pooled. Both are computed; `office_overall_method` picks the headline. Decide
from MGB RO1's own last filed report. Also confirm blanks-vs-N/A against the MC text.
**Status:** active

## 2026-09-23 — Anonymity rules for division focal persons

**Decision:** A division focal person sees only their division; services under 5 respondents are
hidden **and left out of the totals**; a demographic breakdown with any group under 5 is hidden
whole; comments are visible only after CART releases them; no contact details, ever.
**Why:** Hiding a small service but keeping it in the total lets anyone recover it by subtraction;
hiding one small demographic group leaves it recoverable from the rest. A division can often guess
who a small group of clients were.
**Status:** active

## 2026-09-23 — Imports: nothing silent, nothing partial by accident

**Decision:** Every import is a batch. The file is re-parsed at commit (the preview is never
trusted); rejected rows or tally warnings block the commit unless explicitly accepted; re-importing
replaces that batch only, atomically; the old online form's email column is never imported.
**Why:** The golden test depends on imports being exact, and the report is only as good as its
inputs. Minimisation: the report does not need the old emails.
**Status:** active — mappings to be tuned against the office's real samples (Phase 0).

## 2026-09-23 — Retries are safe; Turnstile is checked after the idempotency lookup

**Decision:** The browser generates `submission_id`; the database makes it UNIQUE; a retry returns
the first reference. The lookup runs before Siteverify.
**Why:** A reply lost on a bad mobile connection must not create a second response, and a retry
carries the same, already-spent Turnstile token, so checking Turnstile first would refuse it.
**Status:** active

## 2026-09-23 — Development sign-in only for localhost requests

**Decision:** `DEV_AUTH_EMAIL` (in `.dev.vars`) signs a developer in, but only when the request's
own hostname is localhost; production also fails closed (503) if the Access settings are empty.
**Why:** A deployed Worker is never reached under a localhost hostname, so a leaked dev variable
still cannot open it. Tested both ways.
**Status:** active

## 2026-09-23 — Deploy to the mgbr1.fad Cloudflare account, signed in with the FAD login

**Decision:** Both Workers and the D1 database live in the mgbr1.fad Cloudflare account. Wrangler
signs in with the shared FAD login (the owner's choice over inviting a personal email as a
member). The account ID is pinned as `account_id` in all three Wrangler configs; `npm run
deploy:*` and `db:migrate:remote` run `scripts/predeploy-check.mjs` first. A deployed public Worker
refuses to serve with Cloudflare's Turnstile test keys.
**Why:** An office-owned account keeps the system and its data out of any personal account. The
pinned ID makes a command under the wrong login fail instead of deploying into another account
(this PC's Wrangler was signed in to a personal account when checked). The pre-deploy check and
the test-key refusal turn the likeliest first-deploy mistakes — placeholder ids, the always-pass
test keys — into errors instead of a quietly unprotected survey.
**Accepted cost:** Cloudflare's audit log shows every change as the FAD login. The app's own audit
log still names each staff member (Access signs them in with their own emails). Mitigation: 2FA on
the FAD Cloudflare login, a second person able to sign in, `wrangler logout` on shared PCs.
**Status:** active — account ID to be pinned once Wrangler is signed in as mgbr1.fad.

## 2026-09-24 — Excluding a response instead of deleting it

**Decision:** Responses are never deleted. CART or an admin can **exclude** one from reports, with
a reason (`staff_test`, `spam`, `duplicate`, `other`) and an optional note (migration 0002). Every
number-producing query filters `excluded_at IS NULL`; the choke point is `loadReport` in
`apps/admin/src/worker/report-data.ts`, plus the dashboard alerts and the import overlap check.
The list shows excluded rows with a badge; the raw responses CSV keeps them, with `excluded_at`
and `excluded_reason` columns. Only an admin can restore. The audit log records the reason, never
the note.
**Why:** The staff pilot left test submissions in the live database, and they would have counted in
the FY2026 ARTA report. Deleting official records is what the triggers exist to prevent; an audited,
reversible exclusion keeps the record and the reason. The same action handles bot bursts and
duplicate paper forms later.
**Accepted cost:** Replacing an import batch deletes its rows, so an exclusion on an imported row
disappears with it (re-importing a corrected file is the fix for bad imported rows anyway).
**Status:** active

Format for new entries:

```markdown
## YYYY-MM-DD — <short decision title>

**Decision:** what was decided.
**Why:** the reasoning — constraints, tradeoffs, what was ruled out.
**Status:** active | superseded by <link/date>
```

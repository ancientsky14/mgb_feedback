# Deployment

Every step here is yours to run: nothing in this repo deploys itself. Run commands from the
repo root unless a step says otherwise. Steps marked **(check)** rest on Cloudflare dashboard
wording that could not be verified from here; follow the dashboard if it differs.

The deploy scripts (`npm run deploy:public`, `npm run deploy:admin`, `npm run db:migrate:remote`)
run `scripts/predeploy-check.mjs` first. They refuse to touch Cloudflare while anything below is
missing or inconsistent, for example:

- a placeholder database id, or a missing or mismatched account id;
- a test or empty Turnstile key;
- a survey address that differs from the Turnstile hostname;
- workers.dev left on;
- a staff side with no Access application.

## Where it runs

| What | Where |
| --- | --- |
| Cloudflare account | **`Ict1@mgb.gov.ph`'s Account**, `b299efc33bdc0c0dea89e9076f87586c`, owned by MGB ICT |
| Who deploys | FAD, through a member login of that account that ICT can revoke |
| Survey | `https://feedback.onemgb.com`, Worker `feedback` |
| Staff side | `https://feedback-admin.onemgb.com`, Worker `feedback-admin`, behind Cloudflare Access |
| Database | D1 `feedback`, location APAC |
| Access | ICT's Zero Trust team (account-wide); this system is one application in it |

workers.dev and preview URLs are off on both Workers, so each has exactly one address: the survey's is the
one Turnstile verifies, and the staff side's is the one Access covers.

## Before QR codes go up in public

These gate the public pilot and go-live, not staff testing (see the proposal and `.claude/TODOS.md`):

- The RD's approval of the pilot.
- The DPO's Privacy Impact Assessment and final privacy notice (`apps/public/src/app/Privacy.tsx`
  is a marked draft).
- The current ARTA CSM form version. Both versions in the system have expired: ARTA-2242-3 (the office's
  paper form) in July 2023, and ARTA-2420-03 in July 2025.
- The Citizen's Charter services list, entered under **Services & QR codes**.
- The address opens on the networks clients actually use. A new domain is often "unrated" by web-filter
  vendors, and filtered networks (offices, schools, guest Wi-Fi) block unrated sites. Before printing:
  - have `onemgb.com` categorized with the major vendors, starting with the one the office network uses;
  - check the survey from the office LAN, the guest Wi-Fi and mobile data.

## 0. Wrangler and the account

1. Sign in with the member login and check that the ICT account is listed:

   ```sh
   npx wrangler login
   npx wrangler whoami     # must list "Ict1@mgb.gov.ph's Account"
   ```

2. The same login can also reach other accounts (FAD's own). What makes every command land in the
   ICT account is the **`account_id` pinned in all three configs**: `db.wrangler.jsonc`,
   `apps/public/wrangler.jsonc` and `apps/admin/wrangler.jsonc`.
   - A test fails unless all three match.
   - An account ID is an identifier, not a password, so it is fine in the public repo.
3. **(check)** Turn on two-factor authentication on the member login, and make sure a second person can
   sign in, for recovery.
4. On a PC others use, run `npx wrangler logout` when you finish. The saved login can deploy.

Cloudflare's own audit log shows changes under the member login. The app's audit log still names
each staff member, because Access signs people in with their own emails.

## 1. The database

With `account_id` pinned, create the database:

```sh
npx wrangler d1 create feedback --location apac -c db.wrangler.jsonc
```

If Wrangler offers to add it to the config, answer **no**. Then:

1. Copy the `database_id` it prints into **all three** configs. `npm test` fails until they match.
2. Apply the schema with `npm run db:migrate:remote`.
3. Check it:
   `npx wrangler d1 execute feedback --remote -c db.wrangler.jsonc --command "SELECT code, status FROM instrument_versions"`.
   It should list three versions.

## 2. Turnstile (the bot check on the survey)

1. **(check)** In the dashboard, switch the account (top left) to the ICT account. Go to Turnstile →
   Add widget:
   - hostname exactly `feedback.onemgb.com`;
   - mode Managed.
2. Put the **site key** in `apps/public/wrangler.jsonc` → `vars.TURNSTILE_SITE_KEY`.
3. `vars.TURNSTILE_EXPECTED_HOSTNAME` is `feedback.onemgb.com`. It must equal the survey's custom domain;
   a test and the pre-deploy check enforce this.

The survey pages send `Referrer-Policy: strict-origin`, not `no-referrer`. Turnstile identifies the site
from the referrer, and without it every check fails with error 110200.

## 3. Deploy the survey, then set its secrets

```sh
npm run deploy:public
```

This creates the custom domain `feedback.onemgb.com`: Cloudflare adds the DNS record and the
certificate, and the first certificate can take a few minutes.

- **(check)** If the deploy reports a permission error on the domain, ask ICT to add it under Workers &
  Pages → `feedback` → Settings → Domains & Routes.
- It also fails if a DNS record named `feedback` already exists.

Deploy first, then set the two secrets. Don't pipe values into `wrangler secret put`: a pipe once stored
an empty secret and still reported success. In PowerShell 7:

```powershell
$s = Read-Host "Turnstile secret key" -MaskInput
if ($s.Length -lt 20) { Write-Error "That looks empty or too short. Nothing was uploaded." } else {
  $f = Join-Path $env:TEMP "feedback-secrets.json"
  @{ TURNSTILE_SECRET_KEY = $s; IP_HASH_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)) } |
    ConvertTo-Json | Set-Content $f
  npx wrangler secret bulk $f --cwd apps/public
  Remove-Item $f
}
Remove-Variable s
```

The Turnstile secret key is on the widget's page. The prompt shows only asterisks, and refuses a paste that
didn't land. `IP_HASH_SECRET` is generated and never shown; never reuse it elsewhere.

**Check** by sending an empty submission. It writes nothing:

```powershell
try { Invoke-WebRequest https://feedback.onemgb.com/api/responses -Method Post -Body '{}' -ContentType 'application/json' } catch { $_.Exception.Response.StatusCode.value__ }
```

- `400` means both secrets are set.
- `503` means one is empty. `npx wrangler tail feedback --cwd apps/public` names the missing one without
  showing its value.

## 4. The staff side, behind Access

The Access application comes **first**, because the staff side is never deployed without it.
`npm run deploy:admin` refuses while the Access values are empty.

1. **(check)** ICT's Zero Trust team must exist. Cloudflare One → Settings shows the team name and domain.
   Setting it up (team name, Free plan) is for the account owner. The team is account-wide: every Access
   application ICT runs shares it.
2. **(check)** Settings → Authentication: enable **One-time PIN**.
3. **(check)** Access → Applications → Add → **Self-hosted**:
   - domain `feedback-admin.onemgb.com`;
   - policy **Allow → Emails**, with the named staff only;
   - session 8–12 hours.

   Copy the **Application Audience (AUD) tag**.
4. In `apps/admin/wrangler.jsonc`, set:
   - `vars.ACCESS_TEAM_DOMAIN` = `https://<team>.cloudflareaccess.com`;
   - `vars.ACCESS_AUD` = the tag.
5. Run `npm run deploy:admin`. It creates `feedback-admin.onemgb.com` the same way as step 3.

The code also verifies every Access token itself (signature, issuer, audience). So a policy that was
switched off or misconfigured leaves the staff side closed, not open.

## 5. The first administrator

Access decides who can sign in; the `staff` table decides what they may do. Add yourself:

```sh
npx wrangler d1 execute feedback --remote -c db.wrangler.jsonc --command "INSERT INTO staff (email, display_name, role, created_at) VALUES ('you@example.com', 'Your Name', 'admin', '2026-10-01T00:00:00.000Z')"
```

Use the exact email you sign in to Access with, in lower case. Add everyone else from
**Staff & settings**, and add the same emails to the Access policy.

## 6. Set up the office data

1. For a staff pilot, load the placeholder services, the QR code `CC1MRS` and `public_base_url`:
   `npx wrangler d1 execute feedback --remote -c db.wrangler.jsonc --file seeds/pilot.sql`.
2. **Staff & settings** → `public_base_url` = `https://feedback.onemgb.com` (the pilot seed sets it).
   Confirm `contact_retention_days` with the DPO.
3. **Services & QR codes** → Divisions, then the Citizen's Charter services. Untick "placeholder".
4. **QR codes** → one per desk or counter → **Poster** → print. No public posters until the approvals in
   "Before QR codes go up in public".
5. **Services & QR codes → Transaction counts**: enter monthly counts from the logbooks.
6. **Imports**: the old online form's CSV export and the paper tallies (template on the page).
7. Staff test submissions: open each under **Responses** → **Exclude from reports** → "Staff test".

## 7. Backups (schedule these)

D1 keeps 7 days of point-in-time history on the Free plan. The office's own verified copy:

```sh
pwsh scripts/backup.ps1 -OutDir C:\feedback-backups
```

It exports the database, restores the export into a throwaway local database, and fails unless every
table's row count matches.

- Schedule it nightly with Windows Task Scheduler, on an office PC that stays signed in to Wrangler with the
  member login.
- Keep `-OutDir` on storage the office controls, readable only by the administrators: the backups hold
  contact emails.
- Run a restore drill before go-live.

## 8. The address

Every QR code encodes `https://feedback.onemgb.com/q/<code>`, so the domain must outlive the posters.
MGB ICT keeps `onemgb.com` registered to MGB, on auto-renew and registrar-locked. If it lapsed, every
printed QR code would stop working, and whoever registered the name next would receive the office's
clients.

If the address ever has to change:

1. Change the custom domain in `apps/public/wrangler.jsonc` → `routes` and `vars.TURNSTILE_EXPECTED_HOSTNAME`
   together. The tests insist they match.
2. Add the new hostname to the Turnstile widget.
3. Update `public_base_url`.
4. Redeploy, and reprint the posters.

## Updating

```sh
npm test
npm run typecheck
npm run lint
npm run db:migrate:remote   # only if migrations/ changed
npm run deploy:public
npm run deploy:admin
```

Apply migrations before deploying code that needs them. The pinned `account_id` makes a command
fail, rather than deploy elsewhere, if Wrangler is signed in to a login without access to the ICT
account.

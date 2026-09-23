# Deployment

Every step here is yours to run: nothing in this repo deploys itself. Run commands from the
repo root unless a step says otherwise. Steps marked **(check)** rest on Cloudflare dashboard
wording that could not be verified from here; follow the dashboard if it differs.

## 0. Before anything is public

These gate go-live, not the pilot (see the proposal and `.claude/TODOS.md`):

- An **office-owned Cloudflare account** (an office email, not a personal one) with at least two
  administrators. Sign in once on this PC: `npx wrangler login`.
- The DPO's Privacy Impact Assessment and final privacy notice (`apps/public/src/app/Privacy.tsx`
  is a marked draft).
- The current ARTA CSM form version (the one built in carries PSA approval ARTA-2420-03, which
  expired 31 July 2025).
- The Citizen's Charter services list, entered under **Services & QR codes**.

## 1. Create the database

```sh
npx wrangler d1 create feedback --location apac
```

Copy the `database_id` it prints into **all three** of `db.wrangler.jsonc`,
`apps/public/wrangler.jsonc` and `apps/admin/wrangler.jsonc`. `npm test` fails until all three
match.

Apply the schema:

```sh
npx wrangler d1 migrations apply feedback --remote -c db.wrangler.jsonc
```

Check: `npx wrangler d1 execute feedback --remote -c db.wrangler.jsonc --command "SELECT code, status FROM instrument_versions"`
lists the two ARTA-2420-03 versions.

## 2. Turnstile (bot check on the public form)

1. **(check)** Cloudflare dashboard → Turnstile → Add widget. Mode: Managed. Hostname: the public
   Worker's address, `mgbr1-feedback-public.<your-subdomain>.workers.dev` (add the office domain
   too once there is one).
2. Put the **site key** in `apps/public/wrangler.jsonc` → `vars.TURNSTILE_SITE_KEY`, and the public
   hostname in `vars.TURNSTILE_EXPECTED_HOSTNAME`.
3. Set the secrets:

```sh
npx wrangler secret put TURNSTILE_SECRET_KEY --cwd apps/public   # the widget's secret key
npx wrangler secret put IP_HASH_SECRET --cwd apps/public         # any long random string; never reuse it elsewhere
```

Without both secrets the public Worker refuses every submission (it fails closed).

## 3. Deploy the public survey

```sh
npm run build -w @feedback/public
npx wrangler deploy --cwd apps/public
```

Check: open `https://mgbr1-feedback-public.<subdomain>.workers.dev/` (the landing page) and
`…/api/context/ZZZZZZ` (answers `{"error":"not_found"}`).

## 4. Deploy the admin side and put it behind Access

```sh
npm run build -w @feedback/admin
npx wrangler deploy --cwd apps/admin
```

Then, before anyone else learns the address:

1. **(check)** Workers & Pages → `mgbr1-feedback-admin` → Settings → Domains & Routes →
   workers.dev → **Enable Cloudflare Access**, then **Manage Cloudflare Access**: allow only the
   named staff emails (one-time PIN to email, or Google). Set the session length to 8–12 hours.
2. **(check)** Zero Trust → Access → Applications → that application: copy the **Application
   Audience (AUD) tag**, and note your team domain, `https://<team>.cloudflareaccess.com`.
3. Put both in `apps/admin/wrangler.jsonc` → `vars.ACCESS_AUD` and `vars.ACCESS_TEAM_DOMAIN`, then
   rebuild and deploy the admin again (as above).

Until step 3 is done the admin API answers `503 access_not_configured` to everyone: that is
deliberate. Preview URLs are switched off on both Workers so Access has no side door.

## 5. The first administrator

Access decides who can sign in; the `staff` table decides what they may do. Add yourself:

```sh
npx wrangler d1 execute feedback --remote -c db.wrangler.jsonc --command "INSERT INTO staff (email, display_name, role, created_at) VALUES ('you@example.com', 'Your Name', 'admin', '2026-10-01T00:00:00.000Z')"
```

Use the exact email you sign in to Access with, in lower case. Add everyone else from
**Staff & settings**, and add the same emails to the Access policy.

## 6. Set up the office data

In the admin side:

1. **Staff & settings** → `public_base_url` = the public Worker's address (`https://…workers.dev`
   for the pilot). Confirm `contact_retention_days` with the DPO.
2. **Services & QR codes** → Divisions, then the Citizen's Charter services. Untick “placeholder”.
3. **QR codes** → one per desk or counter → **Poster** → print. On a workers.dev address, use
   temporary A4 signage only.
4. **Services & QR codes → Transaction counts**: enter monthly counts from the logbooks.
5. **Imports**: the old online form's CSV export and the paper tallies (template on the page).

## 7. Backups (schedule these)

D1 keeps 7 days of point-in-time history on the Free plan. The office's own verified copy:

```sh
pwsh scripts/backup.ps1 -OutDir D:\feedback-backups
```

It exports the database, restores the export into a throwaway local database, and fails unless
every table's row count matches. Schedule it nightly with Windows Task Scheduler on an office PC
that stays signed in to Wrangler. Keep `-OutDir` on storage the office controls, readable only by
the administrators: the backups hold contact emails. Run a restore drill before go-live.

## 8. Later: the office's own web address

QR codes are permanent once printed, so the address they encode should be one MGB controls.
Options, in order of preference; all need whoever administers the MGB domain:

1. A subdomain added as a Workers custom domain (the zone must be on the office's Cloudflare
   account, or delegated to it). **(check)** what the domain's administrator can offer.
2. A redirect path on the regional website that forwards `/feedback/q/<code>` to the Worker.

When it changes: update `public_base_url`, the Turnstile widget's hostnames and
`TURNSTILE_EXPECTED_HOSTNAME`, redeploy, and reprint posters.

## Updating

```sh
npm test && npm run typecheck && npm run lint
npx wrangler d1 migrations apply feedback --remote -c db.wrangler.jsonc   # only if migrations/ changed
npm run build -w @feedback/public
npx wrangler deploy --cwd apps/public
npm run build -w @feedback/admin
npx wrangler deploy --cwd apps/admin
```

Apply migrations before deploying code that needs them.

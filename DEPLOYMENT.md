# Deployment

Every step here is yours to run: nothing in this repo deploys itself. Run commands from the
repo root unless a step says otherwise. Steps marked **(check)** rest on Cloudflare dashboard
wording that could not be verified from here; follow the dashboard if it differs.

The deploy scripts (`npm run deploy:public`, `npm run deploy:admin`, `npm run db:migrate:remote`)
run `scripts/predeploy-check.mjs` first and refuse to touch Cloudflare while anything below is
still missing — a placeholder database id, a missing account id, test Turnstile keys.

## Before QR codes go up in public

These gate the public pilot and go-live, not staff testing (see the proposal and `.claude/TODOS.md`):

- The RD's approval of the pilot.
- The DPO's Privacy Impact Assessment and final privacy notice (`apps/public/src/app/Privacy.tsx`
  is a marked draft).
- The current ARTA CSM form version (the one built in carries PSA approval ARTA-2420-03, which
  expired 31 July 2025).
- The Citizen's Charter services list, entered under **Services & QR codes**.

## 0. Sign Wrangler in to the office account (mgbr1.fad)

The Workers and the database live in the **mgbr1.fad** Cloudflare account (FAD's office login),
never in a personal account.

1. **(check)** In the mgbr1.fad Cloudflare login, turn on two-factor authentication (My Profile →
   Authentication), and make sure a second FAD person can sign in, for recovery.
2. On this PC:

   ```sh
   npx wrangler logout     # drops any other login
   npx wrangler login      # sign in as mgbr1.fad in the browser
   npx wrangler whoami     # must list the FAD account
   ```

3. Pin that **Account ID** as `"account_id"` in `db.wrangler.jsonc`, `apps/public/wrangler.jsonc`
   and `apps/admin/wrangler.jsonc` (same value in all three; a test checks). An account ID is an
   identifier, not a password, so it is fine in the public repo. With it pinned, a command run under
   the wrong login fails instead of landing in another account.
4. On a PC others use, run `npx wrangler logout` when you finish: the saved login can deploy to the
   office account.

Cloudflare's own audit log shows every change as the FAD login. The app's audit log still names
each staff member, because Access signs people in with their own emails.

## 1. Create the database

```sh
npx wrangler d1 create feedback --location apac -c db.wrangler.jsonc
```

Copy the `database_id` it prints into **all three** of `db.wrangler.jsonc`,
`apps/public/wrangler.jsonc` and `apps/admin/wrangler.jsonc`. `npm test` fails until all three
match.

Apply the schema:

```sh
npm run db:migrate:remote
```

Check: `npx wrangler d1 execute feedback --remote -c db.wrangler.jsonc --command "SELECT code, status FROM instrument_versions"`
lists the two ARTA-2420-03 versions.

## 2. Turnstile (bot check on the public form)

The mgbr1.fad account's workers.dev subdomain is `mgbr1-fad`, so a Worker named `feedback` lives
at `feedback.mgbr1-fad.workers.dev` (a Worker's address is `<name>.<subdomain>.workers.dev`).

1. **(check)** Cloudflare dashboard → Turnstile → the widget → Hostnames: exactly
   `feedback.mgbr1-fad.workers.dev` (add the office domain too once there is one). Mode: Managed.
2. The **site key** goes in `apps/public/wrangler.jsonc` → `vars.TURNSTILE_SITE_KEY`, and the same
   hostname in `vars.TURNSTILE_EXPECTED_HOSTNAME` (both done).

## 3. Deploy the public survey, then set its secrets

```sh
npm run deploy:public
npx wrangler secret put TURNSTILE_SECRET_KEY --cwd apps/public   # the widget's secret key
npx wrangler secret put IP_HASH_SECRET --cwd apps/public         # any long random string; never reuse it elsewhere
```

Deploy first: `secret put` on a Worker that does not exist yet creates an empty one under that
name. Until both secrets are set the survey refuses every submission (it fails closed); it also
refuses to run on a deployed address with Cloudflare's test keys.

Check: open `https://feedback.mgbr1-fad.workers.dev/` (the landing page) and
`…/api/context/ZZZZZZ`: it answers `{"error":"not_found"}`. A `503` there means a secret is still
missing or a test key is set.

## 4. Deploy the admin side and put it behind Access

```sh
npm run deploy:admin
```

Then, before anyone else learns the address:

1. **(check)** Workers & Pages → `feedback-admin` → Settings → Domains & Routes →
   workers.dev → **Enable Cloudflare Access**, then **Manage Cloudflare Access**: allow only the
   named staff emails (one-time PIN to email, or Google). Set the session length to 8–12 hours.
2. **(check)** Zero Trust → Access → Applications → that application: copy the **Application
   Audience (AUD) tag**, and note your team domain, `https://<team>.cloudflareaccess.com`.
3. Put both in `apps/admin/wrangler.jsonc` → `vars.ACCESS_AUD` and `vars.ACCESS_TEAM_DOMAIN`, then
   run `npm run deploy:admin` again.

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

1. **Staff & settings** → `public_base_url` = `https://feedback.mgbr1-fad.workers.dev` for the
   pilot. Confirm `contact_retention_days` with the DPO.
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
npm test
npm run typecheck
npm run lint
npm run db:migrate:remote   # only if migrations/ changed
npm run deploy:public
npm run deploy:admin
```

Apply migrations before deploying code that needs them. Signed in to Wrangler as someone other
than mgbr1.fad? The pinned `account_id` makes the command fail rather than deploy elsewhere.

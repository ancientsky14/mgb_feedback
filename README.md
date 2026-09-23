# MGB RO1 Client Feedback System

The ARTA Client Satisfaction Measurement for the Mines and Geosciences Bureau Regional Office
No. I: clients answer the official ARTA questionnaire by scanning a QR code, and CART gets the
annual CSM report, the dashboard and the response register without tallying by hand. Paper
forms are typed in, and the records from before go-live are imported, so a year's report covers
every channel.

- `apps/public` — the survey (Cloudflare Worker + React)
- `apps/admin` — the staff side, behind Cloudflare Access
- `packages/shared` — the ARTA instrument, scoring and report logic, with tests against a filed
  agency report
- `migrations/` — the D1 database schema

Development: see `AGENTS.md`. Deployment: see `DEPLOYMENT.md`.

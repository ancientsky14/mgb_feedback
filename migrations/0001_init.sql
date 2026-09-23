-- 0001_init.sql — Phase 1: the ARTA CSM core.
--
-- Conventions
--   * Timestamps (…_at) are UTC ISO-8601 text, e.g. 2026-09-23T01:02:03.456Z.
--   * Calendar dates (transaction_date, valid_from, purge_after) and months are Manila
--     dates as text: YYYY-MM-DD / YYYY-MM.
--   * Every closed set below mirrors packages/shared/src/constants.ts. Change both together.
--   * Migrations are append-only: never edit this file once applied anywhere; add 0002_….

CREATE TABLE divisions (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT NOT NULL
);

CREATE TABLE services (
  id              INTEGER PRIMARY KEY,
  division_id     INTEGER NOT NULL REFERENCES divisions (id),
  cc_ref          TEXT,                                   -- Citizen's Charter service it maps to
  name            TEXT NOT NULL,
  name_fil        TEXT,
  name_ilo        TEXT,
  classification  TEXT CHECK (classification IN ('simple', 'complex', 'highly_technical')),
  processing_days INTEGER CHECK (processing_days > 0),
  is_external     INTEGER NOT NULL DEFAULT 1 CHECK (is_external IN (0, 1)),
  is_placeholder  INTEGER NOT NULL DEFAULT 0 CHECK (is_placeholder IN (0, 1)),  -- not yet confirmed against the Citizen's Charter
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  UNIQUE (division_id, name)
);

-- Metadata for the questionnaire versions defined in packages/shared/src/instrument/.
-- The wording lives in code, reviewed like code; a row here says whether it is in use.
CREATE TABLE instrument_versions (
  code            TEXT PRIMARY KEY,
  mode            TEXT NOT NULL CHECK (mode IN ('onsite', 'online')),
  psa_approval_no TEXT NOT NULL,
  psa_expiry      TEXT,
  status          TEXT NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX instrument_versions_one_active_per_mode
  ON instrument_versions (mode) WHERE status = 'active';

-- A place (or event) with its own QR code. `code` is the opaque part of the QR URL.
CREATE TABLE service_points (
  id                 INTEGER PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE CHECK (length(code) = 6),
  label              TEXT NOT NULL,
  division_id        INTEGER REFERENCES divisions (id),   -- NULL = offers every division's services
  default_service_id INTEGER REFERENCES services (id),
  mode               TEXT NOT NULL DEFAULT 'onsite' CHECK (mode IN ('onsite', 'online')),
  valid_from         TEXT,
  valid_to           TEXT,
  retired_at         TEXT,
  created_at         TEXT NOT NULL
);

CREATE TABLE import_batches (
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('online_csv', 'paper_tally')),
  file_name     TEXT NOT NULL,
  file_sha256   TEXT NOT NULL,
  period_from   TEXT,
  period_to     TEXT,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_rejected INTEGER NOT NULL DEFAULT 0,
  imported_by   TEXT NOT NULL,
  imported_at   TEXT NOT NULL,
  replaced_by   INTEGER REFERENCES import_batches (id),  -- set when a re-import supersedes this batch
  note          TEXT
);

CREATE TABLE responses (
  id                 INTEGER PRIMARY KEY,
  public_ref         TEXT NOT NULL UNIQUE,
  submission_id      TEXT UNIQUE,                       -- browser-generated UUID; makes retries idempotent
  instrument_code    TEXT NOT NULL REFERENCES instrument_versions (code),
  service_id         INTEGER NOT NULL REFERENCES services (id),
  service_point_id   INTEGER REFERENCES service_points (id),
  channel            TEXT NOT NULL CHECK (channel IN ('qr', 'paper', 'import', 'kiosk', 'online_link')),
  lang               TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en', 'fil', 'ilo')),
  transaction_date   TEXT NOT NULL,
  client_type        TEXT CHECK (client_type IN ('citizen', 'business', 'government')),
  sex                TEXT CHECK (sex IN ('male', 'female')),
  age                INTEGER CHECK (age BETWEEN 1 AND 120),
  region             TEXT CHECK (region IN ('NCR', 'CAR', 'R01', 'R02', 'R03', 'R4A', 'R4B', 'R05', 'R06', 'NIR',
                                            'R07', 'R08', 'R09', 'R10', 'R11', 'R12', 'R13', 'BARMM', 'ABROAD')),
  cc1                INTEGER CHECK (cc1 BETWEEN 1 AND 4),
  cc2                INTEGER CHECK (cc2 BETWEEN 1 AND 5),
  cc3                INTEGER CHECK (cc3 BETWEEN 1 AND 4),
  -- SQD answers: 1–5 on the Likert scale, 0 = N/A, NULL = blank (paper forms only).
  sqd0               INTEGER CHECK (sqd0 BETWEEN 0 AND 5),
  sqd1               INTEGER CHECK (sqd1 BETWEEN 0 AND 5),
  sqd2               INTEGER CHECK (sqd2 BETWEEN 0 AND 5),
  sqd3               INTEGER CHECK (sqd3 BETWEEN 0 AND 5),
  sqd4               INTEGER CHECK (sqd4 BETWEEN 0 AND 5),
  sqd5               INTEGER CHECK (sqd5 BETWEEN 0 AND 5),
  sqd6               INTEGER CHECK (sqd6 BETWEEN 0 AND 5),
  sqd7               INTEGER CHECK (sqd7 BETWEEN 0 AND 5),
  sqd8               INTEGER CHECK (sqd8 BETWEEN 0 AND 5),
  suggestion         TEXT CHECK (length(suggestion) <= 2000),
  comment_visibility TEXT NOT NULL DEFAULT 'cart_only' CHECK (comment_visibility IN ('cart_only', 'released')),
  suspect_burst      INTEGER NOT NULL DEFAULT 0 CHECK (suspect_burst IN (0, 1)),
  control_no         TEXT,                               -- paper forms
  encoded_by         TEXT,                               -- paper forms: who typed it in
  import_batch_id    INTEGER REFERENCES import_batches (id),
  submitted_at       TEXT NOT NULL,
  CHECK (channel <> 'paper' OR (control_no IS NOT NULL AND encoded_by IS NOT NULL)),
  CHECK (channel <> 'import' OR import_batch_id IS NOT NULL),
  CHECK (channel NOT IN ('qr', 'kiosk', 'online_link') OR submission_id IS NOT NULL)
);

-- Paper control numbers are unique within the transaction year.
CREATE UNIQUE INDEX responses_paper_control_no
  ON responses (substr(transaction_date, 1, 4), control_no) WHERE control_no IS NOT NULL;
CREATE INDEX responses_by_date ON responses (transaction_date);
CREATE INDEX responses_by_service_date ON responses (service_id, transaction_date);
CREATE INDEX responses_by_batch ON responses (import_batch_id) WHERE import_batch_id IS NOT NULL;

-- Responses are official records. Rows from an import batch may be removed only when a
-- re-import replaces that batch; everything else stays.
CREATE TRIGGER responses_no_delete
BEFORE DELETE ON responses
WHEN OLD.channel <> 'import'
BEGIN
  SELECT RAISE(ABORT, 'responses are official records and cannot be deleted');
END;

-- A client's own answers never change. Paper forms may be corrected when they were typed in
-- wrongly (the correction is audited by the application).
CREATE TRIGGER responses_answers_immutable
BEFORE UPDATE OF public_ref, submission_id, instrument_code, service_id, service_point_id, channel, lang,
                 transaction_date, client_type, sex, age, region, cc1, cc2, cc3,
                 sqd0, sqd1, sqd2, sqd3, sqd4, sqd5, sqd6, sqd7, sqd8, suggestion, submitted_at
ON responses
WHEN OLD.channel <> 'paper'
BEGIN
  SELECT RAISE(ABORT, 'response answers cannot be changed');
END;

-- Contact details are kept apart from answers, hidden by default, and purged on schedule.
CREATE TABLE response_contacts (
  response_id INTEGER PRIMARY KEY REFERENCES responses (id),
  name        TEXT,
  email       TEXT,
  phone       TEXT,
  consent_at  TEXT NOT NULL,
  purge_after TEXT NOT NULL,
  CHECK (name IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL)
);

-- Aggregate counts from paper tally sheets before go-live. The ARTA formula needs only
-- counts per option, so the annual report can add these to per-response data.
--   question 'respondents' holds the respondent count, with option -1.
--   option: SQD 0–5 (0 = N/A), CC 1–5, -1 = blank.
CREATE TABLE legacy_tallies (
  id              INTEGER PRIMARY KEY,
  import_batch_id INTEGER NOT NULL REFERENCES import_batches (id),
  service_id      INTEGER NOT NULL REFERENCES services (id),
  month           TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  question        TEXT NOT NULL CHECK (question IN ('respondents', 'cc1', 'cc2', 'cc3', 'sqd0', 'sqd1', 'sqd2',
                                                    'sqd3', 'sqd4', 'sqd5', 'sqd6', 'sqd7', 'sqd8')),
  option          INTEGER NOT NULL CHECK (option BETWEEN -1 AND 5),
  count           INTEGER NOT NULL CHECK (count >= 0),
  UNIQUE (import_batch_id, service_id, month, question, option)
);

-- Monthly transactions per service: the response-rate denominator.
CREATE TABLE transaction_counts (
  service_id INTEGER NOT NULL REFERENCES services (id),
  month      TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  count      INTEGER NOT NULL CHECK (count >= 0),
  source     TEXT NOT NULL CHECK (source IN ('manual', 'tokens')),
  entered_by TEXT NOT NULL,
  entered_at TEXT NOT NULL,
  PRIMARY KEY (service_id, month)
);

-- Who may use the admin side, and as what. Sign-in itself is Cloudflare Access; this table
-- decides what a signed-in email may do. No row, or inactive, means no access at all.
CREATE TABLE staff (
  email        TEXT PRIMARY KEY CHECK (email = lower(email)),
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'cart', 'division_focal', 'management')),
  division_id  INTEGER REFERENCES divisions (id),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at   TEXT NOT NULL,
  CHECK (role <> 'division_focal' OR division_id IS NOT NULL)
);

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY,
  at        TEXT NOT NULL,
  actor     TEXT NOT NULL,        -- staff email, 'public' or 'system'
  action    TEXT NOT NULL,        -- e.g. 'response.reveal_contact', 'export.responses_csv'
  entity    TEXT,
  entity_id TEXT,
  detail    TEXT                  -- JSON; never contact details or comment text
);

CREATE INDEX audit_log_by_at ON audit_log (at);

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Hourly submission caps keyed on an HMAC of the client IP (never the IP itself).
CREATE TABLE rate_buckets (
  key          TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

-- Reference data every environment needs.
INSERT INTO instrument_versions (code, mode, psa_approval_no, psa_expiry, status, created_at) VALUES
  ('ARTA-2420-03-ONSITE', 'onsite', 'ARTA-2420-03', '2025-07-31', 'active', '2026-09-23T00:00:00.000Z'),
  ('ARTA-2420-03-ONLINE', 'online', 'ARTA-2420-03', '2025-07-31', 'active', '2026-09-23T00:00:00.000Z');

INSERT INTO settings (key, value, updated_by, updated_at) VALUES
  ('contact_retention_days', '365', 'system', '2026-09-23T00:00:00.000Z'),
  ('online_max_transaction_age_days', '90', 'system', '2026-09-23T00:00:00.000Z'),
  ('office_overall_method', 'pooled', 'system', '2026-09-23T00:00:00.000Z');

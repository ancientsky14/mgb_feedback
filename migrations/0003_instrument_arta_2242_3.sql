-- The paper form MGB RO1 still hands out: ARTA-2242-3 (printed expiry 31 July 2023), without SQD0.
-- Retired from the start: it is only for typing in paper forms against the version the client
-- answered; the online survey always uses the active version. Wording lives in
-- packages/shared/src/instrument/arta-csm-2242-3.ts.

INSERT INTO instrument_versions (code, mode, psa_approval_no, psa_expiry, status, created_at) VALUES
  ('ARTA-2242-3-ONSITE', 'onsite', 'ARTA-2242-3', '2023-07-31', 'retired', '2026-09-24T00:00:00.000Z');

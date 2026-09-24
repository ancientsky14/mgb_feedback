-- Staff-only pilot data for the live database. Run once:
--   npx wrangler d1 execute feedback --remote -c db.wrangler.jsonc --file seeds/pilot.sql
-- Safe to re-run (INSERT OR IGNORE). Services are PLACEHOLDERS (is_placeholder = 1): replace
-- them with the office's Citizen's Charter list under Services & QR codes before go-live.

INSERT OR IGNORE INTO divisions (code, name, created_at) VALUES
  ('ORD', 'Office of the Regional Director', '2026-09-24T00:00:00.000Z'),
  ('FAD', 'Finance and Administrative Division', '2026-09-24T00:00:00.000Z'),
  ('MMD', 'Mine Management Division', '2026-09-24T00:00:00.000Z'),
  ('GD', 'Geosciences Division', '2026-09-24T00:00:00.000Z'),
  ('MSESDD', 'Mine Safety, Environment and Social Development Division', '2026-09-24T00:00:00.000Z');

INSERT OR IGNORE INTO services (division_id, cc_ref, name, is_placeholder, sort_order, created_at)
SELECT d.id, 'TODO-CC', s.name, 1, s.sort, '2026-09-24T00:00:00.000Z'
FROM (SELECT 'ORD' AS code, 'Information and consultation (placeholder)' AS name, 10 AS sort
      UNION ALL SELECT 'MMD', 'Mining permit or tenement application (placeholder)', 20
      UNION ALL SELECT 'MMD', 'Quarry, sand and gravel concern (placeholder)', 30
      UNION ALL SELECT 'GD', 'Geohazard assessment or certification (placeholder)', 40) s
JOIN divisions d ON d.code = s.code;

-- One QR code for the Public Assistance and Complaints Desk, offering every service.
INSERT OR IGNORE INTO service_points (code, label, division_id, default_service_id, mode, created_at)
VALUES ('CC1MRS', 'Public Assistance and Complaints Desk (pilot)', NULL, NULL, 'onsite', '2026-09-24T00:00:00.000Z');

INSERT INTO settings (key, value, updated_by, updated_at)
VALUES ('public_base_url', 'https://feedback.onemgb.com', 'system', '2026-09-24T00:00:00.000Z')
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

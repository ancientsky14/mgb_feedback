-- Local development data only. Never apply to the production database.
--
-- Divisions follow the usual MGB regional office structure and services are PLACEHOLDERS
-- (is_placeholder = 1, cc_ref 'TODO-CC'): the real list comes from the office's Citizen's
-- Charter, supplied by CART. Do not guess office values.

INSERT INTO divisions (id, code, name, created_at) VALUES
  (1, 'ORD', 'Office of the Regional Director', '2026-09-23T00:00:00.000Z'),
  (2, 'FAD', 'Finance and Administrative Division', '2026-09-23T00:00:00.000Z'),
  (3, 'MMD', 'Mine Management Division', '2026-09-23T00:00:00.000Z'),
  (4, 'GD', 'Geosciences Division', '2026-09-23T00:00:00.000Z'),
  (5, 'MSESDD', 'Mine Safety, Environment and Social Development Division', '2026-09-23T00:00:00.000Z');

INSERT INTO services (id, division_id, cc_ref, name, classification, processing_days, is_placeholder, sort_order, created_at) VALUES
  (1, 1, 'TODO-CC', 'Information and consultation (placeholder)', 'simple', 3, 1, 10, '2026-09-23T00:00:00.000Z'),
  (2, 2, 'TODO-CC', 'Administrative request (placeholder)', 'simple', 3, 1, 20, '2026-09-23T00:00:00.000Z'),
  (3, 3, 'TODO-CC', 'Mining permit or tenement application (placeholder)', 'highly_technical', 20, 1, 30, '2026-09-23T00:00:00.000Z'),
  (4, 3, 'TODO-CC', 'Quarry, sand and gravel concern (placeholder)', 'complex', 7, 1, 40, '2026-09-23T00:00:00.000Z'),
  (5, 4, 'TODO-CC', 'Geohazard assessment or certification (placeholder)', 'complex', 7, 1, 50, '2026-09-23T00:00:00.000Z'),
  (6, 5, 'TODO-CC', 'Mine safety and environment concern (placeholder)', 'complex', 7, 1, 60, '2026-09-23T00:00:00.000Z');

INSERT INTO service_points (id, code, label, division_id, default_service_id, mode, created_at) VALUES
  (1, 'PACD01', 'Public Assistance and Complaints Desk', NULL, 1, 'onsite', '2026-09-23T00:00:00.000Z'),
  (2, 'MMD001', 'Mine Management Division counter', 3, 3, 'onsite', '2026-09-23T00:00:00.000Z'),
  (3, 'GD0001', 'Geosciences Division counter', 4, 5, 'onsite', '2026-09-23T00:00:00.000Z');

-- Matches DEV_AUTH_EMAIL in apps/admin/.dev.vars.example.
INSERT INTO staff (email, display_name, role, division_id, created_at) VALUES
  ('dev@example.com', 'Local developer', 'admin', NULL, '2026-09-23T00:00:00.000Z');

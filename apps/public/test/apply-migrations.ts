import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Real migrations, then the same fixture data every test file starts from.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

const t = "2026-01-01T00:00:00.000Z";
await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO divisions (id, code, name, created_at) VALUES (1, 'ORD', 'Office of the RD', ?1), (3, 'MMD', 'Mine Management', ?1), (4, 'GD', 'Geosciences', ?1)`).bind(t),
  env.DB.prepare(
    `INSERT OR IGNORE INTO services (id, division_id, name, created_at, active) VALUES
       (1, 1, 'Information', ?1, 1), (3, 3, 'Permit', ?1, 1), (4, 3, 'Quarry', ?1, 1),
       (5, 4, 'Geohazard', ?1, 1), (6, 3, 'Retired service', ?1, 0)`,
  ).bind(t),
  env.DB.prepare(
    `INSERT OR IGNORE INTO service_points (id, code, label, division_id, default_service_id, mode, valid_from, valid_to, retired_at, created_at) VALUES
       (1, 'PACD01', 'Public Assistance and Complaints Desk', NULL, 1, 'onsite', NULL, NULL, NULL, ?1),
       (2, 'MMD001', 'MMD counter', 3, 3, 'onsite', NULL, NULL, NULL, ?1),
       (3, 'RTD001', 'Retired counter', NULL, NULL, 'onsite', NULL, NULL, ?1, ?1),
       (4, 'EVT001', 'Past event booth', NULL, NULL, 'onsite', '2025-01-10', '2025-01-12', NULL, ?1),
       (5, 'WEB001', 'Online transactions', NULL, NULL, 'online', NULL, NULL, NULL, ?1)`,
  ).bind(t),
]);

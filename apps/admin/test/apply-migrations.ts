import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

const t = "2026-01-01T00:00:00.000Z";
const sqd = (v: number | null) => Array.from({ length: 9 }, () => v);

await env.DB.batch([
  env.DB.prepare(
    `INSERT OR IGNORE INTO divisions (id, code, name, created_at) VALUES (1, 'ORD', 'Office of the RD', ?1), (3, 'MMD', 'Mine Management', ?1), (4, 'GD', 'Geosciences', ?1)`,
  ).bind(t),
  env.DB.prepare(
    `INSERT OR IGNORE INTO services (id, division_id, name, created_at) VALUES
       (1, 1, 'Information', ?1), (3, 3, 'Permit', ?1), (4, 3, 'Quarry', ?1), (5, 4, 'Geohazard', ?1)`,
  ).bind(t),
  env.DB.prepare(
    `INSERT OR IGNORE INTO service_points (id, code, label, division_id, default_service_id, mode, created_at) VALUES
       (1, 'PACD01', 'PACD', NULL, 1, 'onsite', ?1)`,
  ).bind(t),
  env.DB.prepare(
    `INSERT OR IGNORE INTO staff (email, display_name, role, division_id, active, created_at) VALUES
       ('admin@mgb.test', 'Admin', 'admin', NULL, 1, ?1),
       ('cart@mgb.test', 'CART Secretariat', 'cart', NULL, 1, ?1),
       ('focal@mgb.test', 'MMD Focal', 'division_focal', 3, 1, ?1),
       ('rd@mgb.test', 'Regional Director', 'management', NULL, 1, ?1),
       ('former@mgb.test', 'Former staff', 'cart', NULL, 0, ?1),
       ('dev@example.com', 'Local developer', 'admin', NULL, 1, ?1)`,
  ).bind(t),
]);

// Six MMD Permit responses (one with a suggestion and an email), two MMD Quarry, two GD Geohazard.
const insert = env.DB.prepare(
  `INSERT OR IGNORE INTO responses (id, public_ref, submission_id, instrument_code, service_id, service_point_id, channel,
     transaction_date, client_type, cc1, cc2, cc3, sqd0, sqd1, sqd2, sqd3, sqd4, sqd5, sqd6, sqd7, sqd8, suggestion, submitted_at)
   VALUES (?1, ?2, ?3, 'ARTA-2420-03-ONSITE', ?4, 1, 'qr', ?5, 'citizen', 1, 1, 1, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`,
);
const rows: [number, number, string, number, string | null][] = [
  [1, 3, "2026-09-02", 5, "=HYPERLINK(\"http://evil\")"],
  [2, 3, "2026-09-03", 5, null],
  [3, 3, "2026-09-04", 4, null],
  [4, 3, "2026-09-05", 4, null],
  [5, 3, "2026-09-06", 5, null],
  [6, 3, "2026-09-07", 2, null],
  [7, 4, "2026-09-08", 5, null],
  [8, 4, "2026-09-09", 5, null],
  [9, 5, "2026-09-10", 1, "Rude guard at the gate"],
  [10, 5, "2026-09-11", 5, null],
];
await env.DB.batch(
  rows.map(([id, service, date, v, suggestion]) =>
    insert.bind(id, `TEST-${String(id).padStart(4, "0")}-REF0`, crypto.randomUUID(), service, date, ...sqd(v), suggestion, t),
  ),
);
await env.DB.prepare(
  `INSERT OR IGNORE INTO response_contacts (response_id, email, consent_at, purge_after) VALUES (1, 'client@example.ph', ?1, '2027-01-01')`,
)
  .bind(t)
  .run();

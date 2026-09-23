/**
 * An audit row. `detail` is JSON of ids, field names and counts only — never contact details
 * or comment text, because the audit log is kept longer than either and cannot be purged.
 */
export function auditStatement(
  db: D1Database,
  entry: { actor: string; action: string; entity?: string; entityId?: string | number; detail?: Record<string, unknown> },
): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO audit_log (at, actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
    .bind(
      new Date().toISOString(),
      entry.actor,
      entry.action,
      entry.entity ?? null,
      entry.entityId === undefined ? null : String(entry.entityId),
      entry.detail ? JSON.stringify(entry.detail) : null,
    );
}

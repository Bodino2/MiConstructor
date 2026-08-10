import type { Database, DatabaseClient } from "../db.js";

type Queryable = Pick<Database, "query"> | Pick<DatabaseClient, "query">;

export async function audit(
  database: Queryable,
  event: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    ip?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await database.query(
    `INSERT INTO audit_events
      (actor_user_id, action, entity_type, entity_id, ip_address, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      event.actorUserId ?? null,
      event.action,
      event.entityType,
      event.entityId ?? null,
      event.ip ?? null,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}

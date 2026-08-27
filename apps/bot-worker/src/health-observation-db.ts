import type { D1Database } from "./db.ts";
import { normalizeHealthObservation, type HealthObservationInput } from "./health-observation.ts";

export async function saveHealthObservation(
  db: D1Database,
  userId: number,
  connectionId: number | null,
  input: HealthObservationInput,
): Promise<number> {
  if (connectionId !== null) {
    const connection = await db.prepare("SELECT id FROM external_connections WHERE id=? AND user_id=?")
      .bind(connectionId, userId).first<{ id: number }>();
    if (!connection) throw new Error("Внешнее подключение не принадлежит пользователю");
  }
  const value = normalizeHealthObservation(input);
  const row = await db.prepare(`INSERT INTO health_observations(
      user_id,connection_id,metric,value,unit,observed_start,observed_end,source,external_id,quality,dedup_key,metadata_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,source,dedup_key) DO UPDATE SET
      connection_id=excluded.connection_id,value=excluded.value,unit=excluded.unit,
      observed_start=excluded.observed_start,observed_end=excluded.observed_end,
      external_id=excluded.external_id,quality=excluded.quality,metadata_json=excluded.metadata_json,
      imported_at=CURRENT_TIMESTAMP
    RETURNING id`).bind(
      userId, connectionId, value.metric, value.value, value.unit, value.observedStart, value.observedEnd,
      value.source, value.externalId, value.quality, value.dedupKey, value.metadataJson,
    ).first<{ id: number }>();
  if (!row) throw new Error("Не удалось сохранить показатель здоровья");
  return row.id;
}

import { randomUUID } from 'node:crypto';
import type { DatabaseBoundary } from '@nexus-ai/db';

export type RealtimeDatabase = Pick<NonNullable<DatabaseBoundary['pool']>, 'query'>;

/** Caller holds the project/container locks and commits the mutation and event together. */
export async function appendRealtimeEvent(db: RealtimeDatabase, projectId: string, actorId: string, kind: 'session.changed' | 'live.changed' | 'work.changed', entityId: string): Promise<string> {
  const cursor = (await db.query<{ sequence: string }>(`INSERT INTO project_realtime_cursor (project_id, sequence) VALUES ($1, 1)
    ON CONFLICT (project_id) DO UPDATE SET sequence = project_realtime_cursor.sequence + 1 RETURNING sequence::text`, [projectId])).rows[0];
  if (!cursor) throw new Error('Realtime cursor unavailable');
  await db.query(`INSERT INTO realtime_event (project_id, sequence, event_id, kind, entity_id, actor_id)
    VALUES ($1, $2::bigint, $3, $4, $5, $6)`, [projectId, cursor.sequence, randomUUID(), kind, entityId, actorId]);
  await db.query('DELETE FROM realtime_event WHERE project_id = $1 AND sequence <= $2::bigint - 1000', [projectId, cursor.sequence]);
  return cursor.sequence;
}

import type { OverviewActivity } from '@nexus-ai/contracts';
import type { WorkDb } from './work-common.js';

/** Project current ACLs before coalescing/pagination; comments inherit the live parent audience. */
export async function readWorkActivity(db: WorkDb, projectId: string, team: boolean,
  summary?: { start: Date; end: Date; actorId: string | null }): Promise<OverviewActivity[]> {
  const rows = (await db.query<{ event_id: string; sequence: string; target_kind: string; target_id: string; actor_id: string; author_name: string; title: string; visibility: 'team' | 'client'; occurred_at: Date }>(`WITH work_targets AS (
    SELECT 'task'::text AS kind,id,title,visibility FROM task WHERE project_id=$1 AND ($2::boolean OR visibility='client')
    UNION ALL SELECT 'milestone',id,title,visibility FROM milestone WHERE project_id=$1 AND ($2::boolean OR visibility='client')
    UNION ALL SELECT 'document',id,title,visibility FROM project_document WHERE project_id=$1 AND ($2::boolean OR visibility='client')
    UNION ALL SELECT 'update',id,title,visibility FROM project_update WHERE project_id=$1 AND ($2::boolean OR visibility='client')
    UNION ALL SELECT 'deliverable',id,title,visibility FROM deliverable WHERE project_id=$1 AND ($2::boolean OR visibility='client')
  ), work_feedback AS (
    SELECT 'feedback'::text AS kind,f.id,'Client feedback'::text AS title,COALESCE(t.visibility,'client') AS visibility
    FROM client_feedback f LEFT JOIN work_targets t ON t.kind=f.target_kind AND t.id=f.target_id
    WHERE f.project_id=$1 AND (f.target_kind='project' AND f.target_id IS NULL OR t.id IS NOT NULL)
  ), work_parents AS (SELECT * FROM work_targets UNION ALL SELECT * FROM work_feedback),
  work_comments AS (
    SELECT 'comment'::text AS kind,c.id,'Project comment'::text AS title,p.visibility FROM work_comment c
    JOIN work_parents p ON p.kind=c.target_kind AND p.id=c.target_id WHERE c.project_id=$1
  ), work_visible AS (SELECT * FROM work_parents UNION ALL SELECT * FROM work_comments),
  work_latest AS (
    SELECT DISTINCT ON (w.target_kind,w.target_id) e.event_id,e.sequence,e.actor_id,e.occurred_at,w.target_kind,w.target_id,v.title,v.visibility
    FROM realtime_event e JOIN work_change w ON w.id=e.entity_id AND w.project_id=e.project_id
    JOIN work_visible v ON v.kind=w.target_kind AND v.id=w.target_id
    WHERE e.project_id=$1 AND e.kind='work.changed' AND ($3::timestamptz IS NULL OR e.occurred_at >= $3 AND e.occurred_at < $4)
      AND ($5::text IS NULL OR e.actor_id=$5)
    ORDER BY w.target_kind,w.target_id,e.sequence DESC
  ) SELECT w.event_id,w.sequence::text,w.actor_id,w.occurred_at,w.target_kind,w.target_id,w.title,w.visibility,u.name AS author_name
    FROM work_latest w JOIN "user" u ON u.id=w.actor_id ORDER BY w.sequence DESC LIMIT 1000`,
  [projectId, team, summary?.start ?? null, summary?.end ?? null, summary?.actorId ?? null])).rows;
  return rows.map(row => ({ id: row.event_id, sequence: row.sequence,
    category: row.target_kind === 'comment' || row.target_kind === 'feedback' ? 'comments' : row.target_kind === 'task' || row.target_kind === 'milestone' ? 'tasks' : 'documents',
    kind: 'work.changed', target: { kind: `work_${row.target_kind}` as OverviewActivity['target']['kind'], id: row.target_id },
    actor: { id: row.actor_id, name: row.author_name.slice(0, 200) }, title: row.title.slice(0, 140), visibility: row.visibility, occurredAt: row.occurred_at.toISOString() }));
}

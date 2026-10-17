import type { DatabaseBoundary } from '@nexus-ai/db';
import type { OverviewActivity } from '@nexus-ai/contracts';
type Db=Pick<NonNullable<DatabaseBoundary['pool']>,'query'>;

/** No client projection: repository metadata is technical and rechecked on every snapshot. */
export async function readRepositoryActivity(db:Db,projectId:string,team:boolean):Promise<OverviewActivity[]>{
  if(!team)return[];
  const result=await db.query<{event_id:string;sequence:string;id:string;actor_id:string|null;author_name:string;kind:string;title:string;occurred_at:Date}>(`WITH repository_latest AS (
      SELECT DISTINCT ON(entity_id) event_id,sequence,entity_id,project_id,occurred_at FROM realtime_event
      WHERE project_id=$1 AND kind='repository.changed' ORDER BY entity_id,sequence DESC
    ) SELECT e.event_id,e.sequence::text,a.id,a.actor_id,COALESCE(u.name,'GitHub') AS author_name,a.kind,a.title,e.occurred_at
    FROM repository_latest e JOIN repository_activity a ON e.entity_id=a.id AND a.project_id=e.project_id
    JOIN repository r ON r.id=a.repository_id AND r.project_id=a.project_id
    LEFT JOIN "user" u ON u.id=a.actor_id WHERE e.project_id=$1 ORDER BY e.sequence DESC LIMIT 1000`,[projectId]);
  return result.rows.map(row=>({id:row.event_id,sequence:row.sequence,category:row.kind==='commit'?'commits':'comments',kind:'repository.changed',target:{kind:'repository_activity',id:row.id},actor:{id:row.actor_id??'github',name:row.author_name.slice(0,200)},title:row.title.slice(0,140),visibility:'team',occurredAt:row.occurred_at.toISOString()}));
}

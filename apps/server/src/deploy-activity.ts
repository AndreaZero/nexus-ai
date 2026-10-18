import type {DatabaseBoundary} from '@nexus-ai/db';
import type {OverviewActivity} from '@nexus-ai/contracts';
type Db=Pick<NonNullable<DatabaseBoundary['pool']>,'query'>;
export async function readDeploymentActivity(db:Db,projectId:string,team:boolean):Promise<OverviewActivity[]>{
 const result=await db.query<{event_id:string;sequence:string;entity_id:string;actor_id:string;author_name:string;title:string;visibility:'team'|'client';occurred_at:Date;is_deployment:boolean}>(`WITH deployment_latest AS (
  SELECT DISTINCT ON(entity_id) event_id,sequence,entity_id,actor_id,occurred_at FROM realtime_event WHERE project_id=$1 AND kind='deployment.changed' ORDER BY entity_id,sequence DESC
 ) SELECT e.event_id,e.sequence::text,e.entity_id,e.actor_id,u.name AS author_name,COALESCE(d.title,n.name) AS title,COALESCE(parent.visibility,n.visibility) AS visibility,e.occurred_at,(d.id IS NOT NULL) AS is_deployment
 FROM deployment_latest e JOIN "user" u ON u.id=e.actor_id
 LEFT JOIN project_deployment d ON d.id=e.entity_id AND d.project_id=$1
 LEFT JOIN deployment_environment parent ON parent.id=d.environment_id AND parent.project_id=$1
 LEFT JOIN deployment_environment n ON n.id=e.entity_id AND n.project_id=$1
 WHERE (d.id IS NOT NULL OR n.id IS NOT NULL) AND ($2::boolean OR COALESCE(parent.visibility,n.visibility)='client') ORDER BY e.sequence DESC LIMIT 1000`,[projectId,team]);
 return result.rows.map(row=>({id:row.event_id,sequence:row.sequence,category:'deployments',kind:'deployment.changed',target:{kind:row.is_deployment?'deployment':'deployment_environment',id:row.entity_id},actor:{id:row.actor_id,name:row.author_name.slice(0,200)},title:row.title.slice(0,140),visibility:row.visibility,occurredAt:row.occurred_at.toISOString()}));
}

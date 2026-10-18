import type { DatabaseBoundary } from '@nexus-ai/db';
import type { ApplicationRequest, ApplicationResponse, SearchHit } from '@nexus-ai/contracts';

type Db = Pick<NonNullable<DatabaseBoundary['pool']>, 'query'>;
type Search = Extract<ApplicationRequest, { operation: 'search' }>;

/** Materialized ACL projections precede both content matching and pagination. No private runtime is indexed. */
export const searchSql = `WITH accessible AS MATERIALIZED (
 SELECT p.id,p.workspace_id,p.name,p.description,
   (wm.role='owner' OR pm.role IN ('owner','developer')) AS team
 FROM project p JOIN workspace_member wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$1
 LEFT JOIN project_member pm ON pm.project_id=p.id AND pm.user_id=$1
 WHERE (wm.role='owner' OR pm.user_id IS NOT NULL) AND ($2::text IS NULL OR p.id=$2)
), visible AS MATERIALIZED (
 SELECT a.id,a.workspace_id,a.id AS project_id,a.name AS project_name,'project'::text AS kind,a.name AS title,a.description AS body FROM accessible a
 UNION ALL SELECT t.id,a.workspace_id,a.id,a.name,'task',t.title,t.description FROM accessible a JOIN task t ON t.project_id=a.id WHERE a.team OR t.visibility='client'
 UNION ALL SELECT t.id,a.workspace_id,a.id,a.name,'milestone',t.title,t.description FROM accessible a JOIN milestone t ON t.project_id=a.id WHERE a.team OR t.visibility='client'
 UNION ALL SELECT t.id,a.workspace_id,a.id,a.name,'document',t.title,t.body FROM accessible a JOIN project_document t ON t.project_id=a.id WHERE a.team OR t.visibility='client'
 UNION ALL SELECT t.id,a.workspace_id,a.id,a.name,'update',t.title,t.body FROM accessible a JOIN project_update t ON t.project_id=a.id WHERE a.team OR t.visibility='client'
 UNION ALL SELECT t.id,a.workspace_id,a.id,a.name,'deliverable',t.title,v.body FROM accessible a JOIN deliverable t ON t.project_id=a.id
   JOIN deliverable_version v ON v.deliverable_id=t.id AND v.version=t.version
   WHERE a.team OR (t.visibility='client' AND v.visibility='client')
 UNION ALL SELECT t.id,a.workspace_id,a.id,a.name,'shared_session',t.title,
   coalesce((SELECT string_agg(m->>'text',E'\n' ORDER BY n) FROM jsonb_array_elements(t.messages) WITH ORDINALITY AS x(m,n)),'')
   FROM accessible a JOIN ai_session t ON t.project_id=a.id WHERE a.team OR t.visibility='client'
 UNION ALL SELECT t.id,a.workspace_id,a.id,a.name,'live_share',t.title,
   coalesce((SELECT string_agg(m->>'text',E'\n' ORDER BY n) FROM jsonb_array_elements(t.messages) WITH ORDINALITY AS x(m,n)),'')
   FROM accessible a JOIN live_share t ON t.project_id=a.id WHERE a.team OR t.visibility='client'
 UNION ALL SELECT t.id,a.workspace_id,a.id,a.name,'environment',t.name,'' FROM accessible a JOIN deployment_environment t ON t.project_id=a.id WHERE a.team OR t.visibility='client'
 UNION ALL SELECT t.id,a.workspace_id,a.id,a.name,'deployment',t.title,t.notes FROM accessible a JOIN project_deployment t ON t.project_id=a.id
   JOIN deployment_environment e ON e.id=t.environment_id AND e.project_id=a.id WHERE a.team OR e.visibility='client'
), matched AS (
 SELECT *,strpos(lower(body),lower($3)) AS body_match FROM visible
 WHERE ($4::text IS NULL OR kind=$4) AND (strpos(lower(title),lower($3))>0 OR strpos(lower(body),lower($3))>0)
)
SELECT id,workspace_id,project_id,project_name,kind,left(title,300) AS title,
 substring(body FROM greatest(1,body_match-120) FOR 500) AS excerpt
FROM matched ORDER BY project_id COLLATE "C",kind COLLATE "C",id COLLATE "C" LIMIT $5 OFFSET $6`;

export async function searchApplication(db: Db, userId: string, request: Search): Promise<ApplicationResponse> {
  if (request.projectId) {
    const allowed = (await db.query(`SELECT p.id FROM project p JOIN workspace_member wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$1
      LEFT JOIN project_member pm ON pm.project_id=p.id AND pm.user_id=$1 WHERE p.id=$2 AND (wm.role='owner' OR pm.user_id IS NOT NULL)`, [userId, request.projectId])).rows[0];
    if (!allowed) return { ok: false, code: 'forbidden', message: 'Project unavailable for this account.' };
  }
  const rows = (await db.query<{ id: string; workspace_id: string; project_id: string; project_name: string; kind: SearchHit['kind']; title: string; excerpt: string }>(searchSql,
    [userId, request.projectId, request.query, request.kind, request.limit + 1, request.offset])).rows;
  const items: SearchHit[] = rows.slice(0, request.limit).map(row => ({ id: row.id, workspaceId: row.workspace_id, projectId: row.project_id,
    projectName: row.project_name.slice(0, 200), kind: row.kind, title: row.title, excerpt: row.excerpt }));
  return { ok: true, kind: 'search', query: request.query, items, nextOffset: rows.length > request.limit ? request.offset + request.limit : null, observedAt: new Date().toISOString() };
}

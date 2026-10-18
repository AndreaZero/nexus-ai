import type { DatabaseBoundary } from '@nexus-ai/db';
import { applicationRequestSchema, applicationResponseSchema, applicationPreferencesSchema, defaultApplicationPreferences,
  type ApplicationRequest, type ApplicationResponse, type ApplicationSettings } from '@nexus-ai/contracts';
import { searchApplication } from './application-search.js';

type Db = Pick<NonNullable<DatabaseBoundary['pool']>, 'query'>;
type Actor = { id: string; email: string };
class ApplicationError extends Error {
  constructor(readonly code: Extract<ApplicationResponse, { ok: false }>['code'], message: string) { super(message); }
}
async function settings(db: Db, userId: string, name: string): Promise<ApplicationSettings> {
  const row = (await db.query<{ version: number; preferences: unknown; updated_at: Date }>('SELECT version,preferences,updated_at FROM user_preferences WHERE user_id=$1', [userId])).rows[0];
  return { version: row?.version ?? 0, name: name.slice(0, 200), preferences: applicationPreferencesSchema.parse(row?.preferences ?? structuredClone(defaultApplicationPreferences)), updatedAt: row?.updated_at.toISOString() ?? null };
}

/** Account-scoped preferences and search of explicitly shared content, with no local Codex history. */
export function createApplicationService(database: DatabaseBoundary, reportError?: (error: unknown) => void) {
  return { async execute(actor: Actor, input: ApplicationRequest): Promise<ApplicationResponse> {
    const parsed = applicationRequestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'invalid_request', message: 'Invalid search or settings request.' };
    if (!database.pool) return { ok: false, code: 'unavailable', message: 'Database unavailable.' };
    let db: (Db & { release(): void }) | undefined;
    try {
      db = await database.pool.connect(); await db.query('BEGIN');
      const request = parsed.data;
      // The user lock serializes absent-row inserts and simultaneous profile/preferences saves.
      const user = (await db.query<{ name: string }>(`SELECT name FROM "user" WHERE id=$1${request.operation === 'saveSettings' ? ' FOR UPDATE' : ''}`, [actor.id])).rows[0];
      if (!user) throw new ApplicationError('auth_required', 'Sign in again to access this account.');
      let response: ApplicationResponse;
      if (request.operation === 'search') response = await searchApplication(db, actor.id, request);
      else if (request.operation === 'getSettings') response = { ok: true, kind: 'settings', settings: await settings(db, actor.id, user.name) };
      else {
        if (new Set(request.preferences.notificationCategories).size !== request.preferences.notificationCategories.length)
          throw new ApplicationError('invalid_request', 'Choose each notification category once.');
        const current = await settings(db, actor.id, user.name);
        if (current.version !== request.expectedVersion) throw new ApplicationError('conflict', 'Settings changed. Reload before saving.');
        await db.query('UPDATE "user" SET name=$2,updated_at=now() WHERE id=$1', [actor.id, request.name]);
        await db.query(`INSERT INTO user_preferences(user_id,version,preferences,updated_at) VALUES($1,1,$2::jsonb,now())
          ON CONFLICT(user_id) DO UPDATE SET version=user_preferences.version+1,preferences=EXCLUDED.preferences,updated_at=now()`, [actor.id, JSON.stringify(request.preferences)]);
        response = { ok: true, kind: 'settings', settings: await settings(db, actor.id, request.name) };
      }
      const validated = applicationResponseSchema.parse(response); await db.query('COMMIT'); return validated;
    } catch (error) {
      await db?.query('ROLLBACK').catch(() => undefined);
      if (error instanceof ApplicationError) return { ok: false, code: error.code, message: error.message };
      reportError?.(error); return { ok: false, code: 'unavailable', message: 'Search and settings are temporarily unavailable. Check the connection and retry.' };
    } finally { db?.release(); }
  } };
}

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
interface ThreadRecord { version: 1; threads: { key: string; threadId: string }[] }
function parseRecord(value: unknown): ThreadRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid mapping.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join() !== 'threads,version' || data['version'] !== 1 || !Array.isArray(data['threads']) || data['threads'].length > 1000) throw new Error('Invalid mapping.');
  const keys = new Set<string>();
  for (const item of data['threads']) {
    if (typeof item !== 'object' || item === null || Array.isArray(item) || Object.keys(item).sort().join() !== 'key,threadId' ||
        typeof item.key !== 'string' || !/^[a-f0-9]{64}$/.test(item.key) || keys.has(item.key) ||
        typeof item.threadId !== 'string' || !item.threadId || item.threadId.length > 200 || [...item.threadId].some(character => character.charCodeAt(0) < 32)) throw new Error('Invalid mapping.');
    keys.add(item.key);
  }
  return data as unknown as ThreadRecord;
}

export function codexAccountHome(userData: string, userId: string): string {
  return path.join(userData, 'codex', createHash('sha256').update(userId).digest('hex'));
}
export function codexSessionKey(userId: string, projectId: string, repositoryId: string, cwd: string): string {
  return createHash('sha256').update(JSON.stringify([userId, projectId, repositoryId, cwd])).digest('hex');
}

/** No credentials or transcript: only the last provider thread per authorized local binding. */
export class CodexThreadStorage {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly filename: string;
  constructor(filename: string) { this.filename = filename; }
  private async read() {
    try { return parseRecord(JSON.parse(await readFile(this.filename, 'utf8')) as unknown); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1 as const, threads: [] };
      throw new Error('Local session mapping cannot be read. Check profile permissions.', { cause: error });
    }
  }
  async get(key: string): Promise<string | null> {
    await this.queue;
    return (await this.read()).threads.find(row => row.key === key)?.threadId ?? null;
  }
  set(key: string, threadId: string): Promise<void> {
    const pending = this.queue.then(async () => {
      const record = await this.read();
      record.threads = record.threads.filter(row => row.key !== key).slice(-999);
      record.threads.push({ key, threadId });
      const data = parseRecord(record);
      const temporary = `${this.filename}.${randomUUID()}.tmp`;
      await mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
      try {
        await writeFile(temporary, JSON.stringify(data), { flag: 'wx', mode: 0o600 });
        await rename(temporary, this.filename);
      } finally { await rm(temporary, { force: true }); }
    });
    this.queue = pending.catch(() => undefined);
    return pending;
  }
}

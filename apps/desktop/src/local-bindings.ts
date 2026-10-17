import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { localBindingRequestSchema, localBindingResponseSchema, localBindingSchema, type CollaborationResponse, type LocalBinding, type LocalBindingRequest, type LocalBindingResponse } from '@nexus-ai/contracts';

type BindingError = Exclude<CollaborationResponse, { ok: true }>;
type Authorization = { userId: string } | BindingError;
interface LocalRecord { version: 1; deviceId: string; accounts: { userId: string; bindings: LocalBinding[] }[] }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function parseRecord(value: unknown): LocalRecord {
  if (!object(value, ['version', 'deviceId', 'accounts']) || value['version'] !== 1 ||
      typeof value['deviceId'] !== 'string' || !uuid.test(value['deviceId']) || !Array.isArray(value['accounts'])) throw new Error('Invalid local binding file.');
  const users = new Set<string>();
  const deviceId = value['deviceId'];
  const accounts = value['accounts'].map((account: unknown) => {
    if (!object(account, ['userId', 'bindings']) || typeof account['userId'] !== 'string' || !account['userId'] ||
        users.has(account['userId']) || !Array.isArray(account['bindings'])) throw new Error('Invalid local account binding.');
    users.add(account['userId']);
    const repositories = new Set<string>();
    const bindings = account['bindings'].map((binding: unknown) => {
      const parsed = localBindingSchema.parse(binding);
      const key = `${parsed.projectId}/${parsed.repositoryId}`;
      if (parsed.deviceId !== deviceId || !path.isAbsolute(parsed.rootPath) || parsed.rootPath.includes('\0') || repositories.has(key)) throw new Error('Invalid local directory binding.');
      repositories.add(key);
      return parsed;
    });
    return { userId: account['userId'], bindings };
  });
  return { version: 1, deviceId, accounts };
}

/** Main-process file: local paths are scoped to account and never uploaded. */
export class LocalBindingStorage {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly filename: string;
  constructor(filename: string) { this.filename = filename; }

  private async read(): Promise<LocalRecord> {
    try { return parseRecord(JSON.parse(await readFile(this.filename, 'utf8')) as unknown); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, deviceId: randomUUID(), accounts: [] };
      throw new Error('Local folder settings cannot be read. Check your user profile permissions.', { cause: error });
    }
  }

  private async write(record: LocalRecord): Promise<void> {
    const validated = parseRecord(record);
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    try {
      await writeFile(temporary, JSON.stringify(validated), { mode: 0o600, flag: 'wx' });
      await rename(temporary, this.filename);
    } finally { await rm(temporary, { force: true }); }
  }

  async get(userId: string, projectId: string, repositoryId: string): Promise<LocalBinding | null> {
    await this.queue;
    return (await this.read()).accounts.find(account => account.userId === userId)?.bindings
      .find(binding => binding.projectId === projectId && binding.repositoryId === repositoryId) ?? null;
  }

  private mutate<T>(operation: (record: LocalRecord) => Promise<T>): Promise<T> {
    const pending = this.queue.then(async () => operation(await this.read()));
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  set(userId: string, projectId: string, repositoryId: string, rootPath: string): Promise<LocalBinding> {
    return this.mutate(async (record) => {
      let account = record.accounts.find(account => account.userId === userId);
      if (!account) { account = { userId, bindings: [] }; record.accounts.push(account); }
      const binding = localBindingSchema.parse({ projectId, repositoryId, deviceId: record.deviceId, rootPath,
        label: path.basename(rootPath) || rootPath, updatedAt: new Date().toISOString() });
      account.bindings = account.bindings.filter(item => item.projectId !== projectId || item.repositoryId !== repositoryId);
      account.bindings.push(binding);
      await this.write(record);
      return binding;
    });
  }

  remove(userId: string, projectId: string, repositoryId: string): Promise<void> {
    return this.mutate(async (record) => {
      const account = record.accounts.find(account => account.userId === userId);
      if (!account) return;
      account.bindings = account.bindings.filter(item => item.projectId !== projectId || item.repositoryId !== repositoryId);
      await this.write(record);
    });
  }
}

export class LocalBindingService {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly storage: LocalBindingStorage;
  private readonly authorize: (projectId: string, repositoryId: string) => Promise<Authorization>;
  private readonly chooseDirectory: () => Promise<string | null>;
  constructor(
    storage: LocalBindingStorage,
    authorize: (projectId: string, repositoryId: string) => Promise<Authorization>,
    chooseDirectory: () => Promise<string | null>,
  ) { this.storage = storage; this.authorize = authorize; this.chooseDirectory = chooseDirectory; }

  request(input: LocalBindingRequest): Promise<LocalBindingResponse> {
    const request = localBindingRequestSchema.safeParse(input);
    if (!request.success) return Promise.resolve({ ok: false, code: 'invalid_request', message: 'Choose a valid project repository.' });
    const pending = this.queue.then(async (): Promise<LocalBindingResponse> => {
      const { projectId, repositoryId, operation } = request.data;
      const first = await this.authorize(projectId, repositoryId);
      if ('ok' in first) return first;
      if (operation === 'select') {
        const directory = await this.chooseDirectory();
        // An account or role may have changed while the OS dialog was open.
        const current = await this.authorize(projectId, repositoryId);
        if ('ok' in current) return current;
        if (current.userId !== first.userId) return { ok: false, code: 'auth_required', message: 'The account changed. Select the folder again.' };
        if (directory === null) return { ok: true, binding: await this.storage.get(current.userId, projectId, repositoryId) };
        if (!path.isAbsolute(directory) || directory.includes('\0')) throw new Error('Invalid native directory selection.');
        return { ok: true, binding: await this.storage.set(current.userId, projectId, repositoryId, directory) };
      }
      if (operation === 'remove') {
        await this.storage.remove(first.userId, projectId, repositoryId);
        return { ok: true, binding: null };
      }
      return { ok: true, binding: await this.storage.get(first.userId, projectId, repositoryId) };
    }).then(result => localBindingResponseSchema.parse(result)).catch((): LocalBindingResponse => ({
      ok: false, code: 'unavailable', message: 'Local folder settings are unavailable. Check your user profile permissions and retry.',
    }));
    this.queue = pending;
    return pending;
  }
}

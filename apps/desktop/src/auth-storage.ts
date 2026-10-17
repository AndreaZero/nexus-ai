import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface EncryptionProvider {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export class AuthStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthStorageError';
  }
}

/** Main-process storage only. Neither decrypted entries nor encryption errors cross IPC. */
export class EncryptedAuthStorage {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly filename: string;
  private readonly encryption: EncryptionProvider;
  private readonly platform: string;

  constructor(
    filename: string,
    encryption: EncryptionProvider,
    platform: string,
  ) {
    this.filename = filename;
    this.encryption = encryption;
    this.platform = platform;
  }

  assertAvailable(): void {
    if (!this.encryption.isEncryptionAvailable() ||
        (this.platform === 'linux' && this.encryption.getSelectedStorageBackend() === 'basic_text')) {
      throw new AuthStorageError('Secure credential storage is unavailable. Unlock the OS keyring and restart Nexus AI.');
    }
  }

  private async read(): Promise<Record<string, unknown>> {
    this.assertAvailable();
    let ciphertext: Buffer;
    try {
      ciphertext = await readFile(this.filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw new AuthStorageError('Secure account storage cannot be read. Check your user profile permissions.');
    }
    try {
      const value: unknown = JSON.parse(this.encryption.decryptString(ciphertext));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid record');
      return value as Record<string, unknown>;
    } catch {
      throw new AuthStorageError('Saved account credentials cannot be decrypted. Sign out to clear this device and sign in again.');
    }
  }

  async getItem(key: string): Promise<string | null> {
    await this.queue;
    const value = (await this.read())[key];
    if (value === undefined) return null;
    if (typeof value !== 'string') throw new AuthStorageError('Saved account storage is invalid. Sign out and sign in again.');
    return value;
  }

  setItem(key: string, value: string): Promise<void> {
    const operation = this.queue.then(async () => {
      const entries = await this.read();
      entries[key] = value;
      const ciphertext = this.encryption.encryptString(JSON.stringify(entries));
      const temporary = `${this.filename}.${randomUUID()}.tmp`;
      await mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
      try {
        await writeFile(temporary, ciphertext, { mode: 0o600, flag: 'wx' });
        await rename(temporary, this.filename);
      } finally {
        await rm(temporary, { force: true });
      }
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async clear(): Promise<void> {
    await this.queue;
    await rm(this.filename, { force: true });
  }
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EncryptedAuthStorage, type EncryptionProvider } from '../src/auth-storage.ts';

const encryption: EncryptionProvider = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptString: (value) => Buffer.from(`encrypted:${Buffer.from(value).toString('base64')}`),
  decryptString: (value) => {
    if (!value.toString().startsWith('encrypted:')) throw new Error('Corrupt ciphertext');
    return Buffer.from(value.toString().slice(10), 'base64').toString();
  },
};

test('credential records are encrypted, atomic and concurrent updates retain both entries', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-auth-'));
  const filename = path.join(directory, 'account.bin');
  try {
    const storage = new EncryptedAuthStorage(filename, encryption, 'linux');
    assert.equal(await storage.getItem('session'), null);
    await Promise.all([storage.setItem('session', 'test-session-secret'), storage.setItem('cookie', 'test-cookie-secret')]);
    assert.equal(await storage.getItem('session'), 'test-session-secret');
    assert.equal(await new EncryptedAuthStorage(filename, encryption, 'linux').getItem('cookie'), 'test-cookie-secret');
    assert.equal((await readFile(filename)).includes('test-session-secret'), false);
    await storage.clear();
    assert.equal(await storage.getItem('session'), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('weak Linux keyrings and unavailable encryption fail closed without persisting', async () => {
  for (const provider of [
    { ...encryption, isEncryptionAvailable: () => false },
    { ...encryption, getSelectedStorageBackend: () => 'basic_text' },
  ]) {
    const storage = new EncryptedAuthStorage('/unused/account.bin', provider, 'linux');
    await assert.rejects(storage.getItem('cookie'), /Secure credential storage is unavailable/);
    await assert.rejects(storage.setItem('cookie', 'test-cookie-secret'), /Secure credential storage is unavailable/);
  }
});

test('corrupt encrypted credentials do not become an implicit plaintext fallback', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-auth-'));
  const filename = path.join(directory, 'account.bin');
  try {
    await writeFile(filename, 'accidental plaintext credentials');
    const storage = new EncryptedAuthStorage(filename, encryption, 'win32');
    await assert.rejects(storage.getItem('cookie'), /cannot be decrypted/);
    await assert.rejects(storage.setItem('cookie', 'test-cookie-secret'), /cannot be decrypted/);
    await storage.clear();
    await storage.setItem('cookie', 'fresh-session');
    assert.equal(await storage.getItem('cookie'), 'fresh-session');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

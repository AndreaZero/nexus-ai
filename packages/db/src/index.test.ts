import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDatabaseBoundary,
  DatabaseConfigurationError,
  readDatabaseConfig,
} from './index.js';

test('an absent or empty database URL does not create a connection', async () => {
  for (const value of [undefined, '', '  ']) {
    const config = readDatabaseConfig({ DATABASE_URL: value });
    assert.deepEqual(config, { configured: false });
    const database = createDatabaseBoundary(config);
    assert.equal(database.status, 'not_configured');
    await database.close();
    await database.close();
  }
});

test('a valid PostgreSQL URL remains explicitly unconnected', async () => {
  const config = readDatabaseConfig({ DATABASE_URL: 'postgresql://localhost/nexus' });
  const database = createDatabaseBoundary(config);
  assert.equal(database.status, 'not_connected');
  assert.equal('connectionString' in database, false);
  await database.close();
});

test('configuration errors never disclose connection credentials', () => {
  for (const connectionString of [
    'https://user:secret@example.test/nexus',
    'postgresql://user:secret@example.test/',
    'postgresql://user:secret@example.test/nexus#secret',
    'secret',
  ]) {
    assert.throws(
      () => readDatabaseConfig({ DATABASE_URL: connectionString }),
      (error: unknown) => {
        assert.ok(error instanceof DatabaseConfigurationError);
        assert.equal(error.message.includes('secret'), false);
        return true;
      },
    );
  }
});

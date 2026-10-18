import assert from 'node:assert/strict';
import test from 'node:test';
import { collaborationRequestSchema, repositorySchema, remoteRepositoryUrlSchema } from '@nexus-ai/contracts';

const projectId = 'c588dc20-9f17-4f13-9354-8b7ed43be890';
const repositoryId = '21a22c8f-2729-48bd-953d-8d6057ea6663';

function request(remoteUrl: string) {
  return { operation: 'setRepository', projectId, remoteUrl, defaultBranch: 'main' };
}
function repository(remoteUrl: string) {
  return { id: repositoryId, projectId, remoteUrl, defaultBranch: 'main' };
}

test('onboarding can represent an existing local repository without inventing a remote URL', () => {
  assert.equal(collaborationRequestSchema.parse(request('')).operation, 'setRepository');
  assert.equal(repositorySchema.parse(repository('')).remoteUrl, '');
  // An absent remote is allowed only for the location metadata; an actual remote still needs HTTPS.
  assert.equal(remoteRepositoryUrlSchema.safeParse('').success, false);
});

test('adding an HTTPS remote later uses the same repository DTO and command', () => {
  for (const remoteUrl of ['https://github.com/AndreaZero/nexus-ai', 'https://git.example.test/team/project.git']) {
    assert.equal(collaborationRequestSchema.safeParse(request(remoteUrl)).success, true);
    assert.equal(repositorySchema.parse(repository(remoteUrl)).remoteUrl, remoteUrl);
    assert.equal(remoteRepositoryUrlSchema.safeParse(remoteUrl).success, true);
  }
});

test('optional remote does not relax credential, transport, query, fragment or malformed URL validation', () => {
  for (const remoteUrl of [
    ' ', 'github.com/AndreaZero/nexus-ai', 'http://github.com/AndreaZero/nexus-ai',
    'file:///private/repository', 'git@github.com:AndreaZero/nexus-ai.git',
    'https://user:secret@github.com/AndreaZero/nexus-ai', 'https://user@github.com/AndreaZero/nexus-ai',
    'https://github.com/AndreaZero/nexus-ai?token=secret', 'https://github.com/AndreaZero/nexus-ai#secret',
  ]) {
    assert.equal(collaborationRequestSchema.safeParse(request(remoteUrl)).success, false);
    assert.equal(repositorySchema.safeParse(repository(remoteUrl)).success, false);
    assert.equal(remoteRepositoryUrlSchema.safeParse(remoteUrl).success, false);
  }
});

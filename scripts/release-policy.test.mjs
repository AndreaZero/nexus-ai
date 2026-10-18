import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReleaseEvidence, releasePolicy, windowsSignatureCommand } from './release-policy.mjs';

test('unsigned builds remove ambient signing credentials and preserve unrelated build configuration', () => {
  const policy = releasePolicy('darwin', 'arm64', 'unsigned', { CSC_LINK: 'private', APPLE_ID: 'private', BETTER_AUTH_URL: 'https://example.invalid' });
  assert.equal(policy.env.CSC_LINK, undefined);
  assert.equal(policy.env.APPLE_ID, undefined);
  assert.equal(policy.env.BETTER_AUTH_URL, 'https://example.invalid');
  assert.equal(policy.env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.deepEqual(policy.config.mac, { identity: '-', hardenedRuntime: false, notarize: false });
});

test('signed Windows requires its dedicated credentials and cannot fall back to another certificate', () => {
  assert.throws(() => releasePolicy('win32', 'x64', 'signed', { CSC_LINK: 'other' }), /WIN_CSC_LINK/);
  const policy = releasePolicy('win32', 'x64', 'signed', { WIN_CSC_LINK: 'explicit', WIN_CSC_KEY_PASSWORD: 'explicit', CSC_LINK: 'other' });
  assert.equal(policy.env.CSC_LINK, undefined);
  assert.equal(policy.config.forceCodeSigning, true);
  assert.throws(() => assertReleaseEvidence('win32', 'signed', { status: 'unsigned' }), /Authenticode/);
});

test('signed Mac requires explicit signing and notarization credentials, then observed validation', () => {
  assert.throws(() => releasePolicy('darwin', 'arm64', 'signed', { CSC_LINK: 'explicit' }), /CSC_KEY_PASSWORD/);
  const env = Object.fromEntries(['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'].map((key) => [key, 'explicit']));
  const policy = releasePolicy('darwin', 'arm64', 'signed', env);
  assert.equal(policy.config.mac.identity, 'explicit');
  assert.equal(policy.config.mac.notarize, true);
  assert.throws(() => assertReleaseEvidence('darwin', 'signed', { status: 'valid', notarization: 'not_validated' }), /notarization/);
  assert.doesNotThrow(() => assertReleaseEvidence('darwin', 'signed', { status: 'valid', notarization: 'validated' }));
});

test('native targets are bounded, Linux does not advertise a platform signature', () => {
  assert.throws(() => releasePolicy('win32', 'ia32', 'unsigned'), /Unsupported/);
  assert.throws(() => releasePolicy('linux', 'x64', 'automatic'), /explicitly/);
  const policy = releasePolicy('linux', 'x64', 'signed', { CSC_LINK: 'private' });
  assert.equal(policy.env.CSC_LINK, undefined);
  assert.equal(policy.config.forceCodeSigning, false);
  assert.equal(policy.extension, 'AppImage');
  assert.equal(policy.artifactArchitecture, 'x86_64');
  assert.equal(policy.architecture, 'x64');
  assert.equal(releasePolicy('linux', 'arm64', 'unsigned').artifactArchitecture, 'arm64');
  assert.equal(releasePolicy('win32', 'x64', 'unsigned').artifactArchitecture, 'x64');
});

test('Authenticode uses the system PowerShell executable and its own modules, regardless of the parent shell', () => {
  const command = windowsSignatureCommand({ SystemRoot: 'C:\\Windows', PSModulePath: 'C:\\Program Files\\PowerShell\\7\\Modules;C:\\private-modules', PATH: 'preserved' });
  assert.equal(command.executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(command.env.PSModulePath, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules');
  assert.equal(command.env.PATH, 'preserved');
  assert.throws(() => windowsSignatureCommand({ SystemRoot: 'relative' }), /unavailable/);
});

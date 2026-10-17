import { spawn } from 'node:child_process';
import os from 'node:os';
import { resolveGitExecutable } from './context-git.ts';

export interface GitReader { run(args: string[], limit?: number): Promise<Buffer | null> }

/** No working-tree Git diff/status: those can execute repository clean filters. */
export async function workspaceGit(cwd: string): Promise<GitReader | null> {
  const executable = await resolveGitExecutable(cwd);
  if (!executable) return null;
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'LANG']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  const nullFile = process.platform === 'win32' ? 'NUL' : os.devNull;
  Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: nullFile,
    GIT_CONFIG_GLOBAL: nullFile, GIT_NO_REPLACE_OBJECTS: '1', GIT_ATTR_NOSYSTEM: '1', LC_ALL: 'C' });
  return { run: (args, limit = 1048576) => new Promise(resolve => {
    const child = spawn(executable, ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
      '-c', `core.hooksPath=${nullFile}`, '-c', `core.attributesFile=${nullFile}`, '-c', 'diff.external=', ...args],
    { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failed = false;
    const timer = setTimeout(() => { failed = true; child.kill(); }, 5000);
    timer.unref();
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limit) { failed = true; child.kill(); } else chunks.push(chunk);
    });
    child.once('error', () => { clearTimeout(timer); resolve(null); });
    child.once('close', code => { clearTimeout(timer); resolve(!failed && code === 0 ? Buffer.concat(chunks) : null); });
  }) };
}

/** Decode each NUL-delimited record separately, preserving spaces and line breaks in names. */
export function gitRecords(buffer: Buffer): string[] {
  const records: string[] = [];
  let start = 0;
  for (let end = 0; end < buffer.length; end++) if (buffer[end] === 0) {
    try { records.push(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(start, end))); } catch { /* Non-UTF-8 names cannot cross the renderer boundary. */ }
    start = end + 1;
  }
  return records;
}

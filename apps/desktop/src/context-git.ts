import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { access, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { ContextSnapshot } from '@nexus-ai/contracts';

type Observation = ContextSnapshot['repository'];

/** Never let Windows search the repository/current directory for a git.exe. */
export async function resolveGitExecutable(cwd: string, searchPath = process.env['PATH'] ?? process.env['Path'] ?? ''): Promise<string | null> {
  for (const directory of searchPath.split(path.delimiter).slice(0, 200)) {
    if (!path.isAbsolute(directory)) continue;
    try {
      const candidate = await realpath(path.join(directory, process.platform === 'win32' ? 'git.exe' : 'git'));
      const relative = path.relative(cwd, candidate);
      if (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)) continue;
      if (!(await stat(candidate)).isFile()) continue;
      await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return candidate;
    } catch { /* A PATH entry need not contain a usable native Git executable. */ }
  }
  return null;
}

/** Fixed read-only Git operations, with no network, optional locks, hooks or fsmonitor. */
function git(executable: string, cwd: string, args: string[]): Promise<string | null> {
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'LANG']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: os.devNull,
    GIT_CONFIG_GLOBAL: os.devNull, GIT_NO_REPLACE_OBJECTS: '1', LC_ALL: 'C' });
  // Git for Windows accepts NUL, while Node's \\.\nul spelling is rejected by Git's config parser.
  const gitNull = process.platform === 'win32' ? 'NUL' : os.devNull;
  env['GIT_CONFIG_SYSTEM'] = gitNull; env['GIT_CONFIG_GLOBAL'] = gitNull;
  return new Promise(resolve => {
    const child = spawn(executable, ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', `core.hooksPath=${gitNull}`, ...args], {
      cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    let output = Buffer.alloc(0);
    let failed = false;
    const timer = setTimeout(() => { failed = true; child.kill(); }, 2500);
    timer.unref();
    child.stdout.on('data', (chunk: Buffer) => {
      if (output.length + chunk.length > 65536) { failed = true; child.kill(); }
      else output = Buffer.concat([output, chunk]);
    });
    child.once('error', () => { clearTimeout(timer); resolve(null); });
    child.once('close', code => { clearTimeout(timer); resolve(!failed && code === 0 ? output.toString('utf8').trim() : null); });
  });
}

export async function observeRepository(cwd: string): Promise<Observation> {
  const observedAt = new Date().toISOString();
  const unknown: Observation = { isGit: false, branch: null, head: null, dirty: null, ahead: null, behind: null, observedAt };
  const executable = await resolveGitExecutable(cwd);
  if (!executable || await git(executable, cwd, ['rev-parse', '--is-inside-work-tree']) !== 'true') return unknown;
  const [branch, head, status, divergence] = await Promise.all([
    git(executable, cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']), git(executable, cwd, ['rev-parse', '--verify', 'HEAD']),
    git(executable, cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=normal', '--ignore-submodules=all']),
    git(executable, cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']),
  ]);
  const counts = divergence?.match(/^(\d+)\s+(\d+)$/);
  return { isGit: true, branch: branch?.slice(0, 200) || null, head: head && /^[a-f0-9]{40,64}$/i.test(head) ? head : null,
    dirty: status === null ? null : status.length > 0, ahead: counts ? Number(counts[1]) : null, behind: counts ? Number(counts[2]) : null, observedAt };
}

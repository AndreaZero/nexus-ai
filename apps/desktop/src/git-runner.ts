import { spawn } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveGitExecutable } from './context-git.ts';

export class GitError extends Error {
  readonly code: 'auth_required' | 'forbidden' | 'invalid_request' | 'unavailable' | 'conflict' | 'not_connected' | 'uncertain';
  constructor(code: GitError['code'], message: string) { super(message); this.code = code; }
}
export interface GitRunner { cwd: string; directory: string; run(args: string[], options?: { input?: Buffer | string; env?: NodeJS.ProcessEnv; token?: string; network?: boolean; optional?: boolean; limit?: number }): Promise<Buffer | null> }
const invalid = () => new GitError('invalid_request', 'This repository uses unsupported Git configuration, links, filters, submodules or worktrees. Use a regular repository root without executable Git extensions.');
const nullFile = process.platform === 'win32' ? 'NUL' : os.devNull;

/** Restrict repository-local configuration before Git can read include/command directives. */
export async function openGit(cwd: string): Promise<GitRunner | null> {
  const directory = path.join(cwd, '.git');
  try { if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) throw invalid(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  for (const relative of ['config', 'HEAD', 'index', 'objects', 'refs', 'logs', 'packed-refs', 'objects/info/alternates', 'objects/info/http-alternates', 'info/grafts', 'commondir', 'config.worktree', 'shallow', 'info/attributes']) {
    const filename = path.join(directory, relative);
    try {
      const info = await lstat(filename);
      if (info.isSymbolicLink() || await realpath(filename) !== filename) throw invalid();
      if (!['config', 'HEAD', 'index', 'objects', 'refs', 'logs', 'packed-refs'].includes(relative) && (!info.isFile() || info.size > 0)) throw invalid();
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  // Git can write loose objects, ref locks and reflogs. Reject links in every directory it may write.
  let examined = 0;
  const inspectDirectories = async (parent: string): Promise<void> => {
    let children: string[];
    try { children = await readdir(parent); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const name of children) {
      if (++examined > 100000) throw invalid();
      const filename = path.join(parent, name); const info = await lstat(filename);
      if (info.isSymbolicLink()) throw invalid();
      if (info.isDirectory()) await inspectDirectories(filename);
    }
  };
  await inspectDirectories(path.join(directory, 'refs'));
  await inspectDirectories(path.join(directory, 'logs'));
  await inspectDirectories(path.join(directory, 'objects'));
  if ((await lstat(path.join(directory, 'config'))).size > 65536) throw invalid();
  const config = await readFile(path.join(directory, 'config'), 'utf8');
  if (config.length > 65536 || /\\\r?\n/.test(config)) throw invalid();
  let section = '';
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[#;]/.test(line)) continue;
    const header = /^\[([A-Za-z0-9.-]+)(?:\s+"[^"\r\n]*")?\]\s*(?:[#;].*)?$/.exec(line);
    if (header) { section = header[1]!.toLowerCase(); if (!['core', 'remote', 'branch', 'user', 'init', 'pull', 'push', 'fetch', 'commit', 'safe', 'gc', 'pack', 'maintenance', 'advice', 'color'].includes(section)) throw invalid(); continue; }
    const key = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=|$)/.exec(line)?.[1]?.toLowerCase();
    if (!key || !section) throw invalid();
    if (section === 'core' && !['repositoryformatversion', 'filemode', 'bare', 'logallrefupdates', 'symlinks', 'ignorecase', 'autocrlf', 'eol', 'quotepath', 'precomposeunicode', 'protecthfs', 'protectntfs', 'longpaths', 'abbrev', 'ignorestat', 'trustctime', 'checkstat', 'excludesfile'].includes(key)) throw invalid();
    if ((section === 'remote' && !['url', 'fetch', 'pushurl', 'tagopt', 'prune'].includes(key)) || (section === 'branch' && !['remote', 'merge', 'rebase', 'description', 'vscode-merge-base'].includes(key))) throw invalid();
    if (['gc', 'pack', 'maintenance', 'commit', 'push', 'fetch'].includes(section) && !['gpgsign', 'default', 'prune', 'prunetags', 'autodetach', 'auto', 'autopacklimit', 'writecommitgraph', 'recurseSubmodules'.toLowerCase()].includes(key)) throw invalid();
  }
  const executable = await resolveGitExecutable(cwd);
  if (!executable) throw new GitError('unavailable', 'Install Git on this computer, then refresh the repository.');
  return { cwd, directory, run: async (args, options = {}) => {
    // libcurl can consult .netrc independently from credential.helper. Network commands receive an empty private home.
    const networkHome = options.network ? await mkdtemp(path.join(os.tmpdir(), 'nexus-git-home-')) : null;
    const env: NodeJS.ProcessEnv = {};
    for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LANG']) if (process.env[name]) env[name] = process.env[name];
    Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: nullFile, GIT_CONFIG_GLOBAL: nullFile, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: nullFile,
      GIT_NO_REPLACE_OBJECTS: '1', GIT_ATTR_NOSYSTEM: '1', GIT_LITERAL_PATHSPECS: '1', GIT_PROTOCOL_FROM_USER: '0', LC_ALL: 'C', ...options.env });
    if (networkHome) Object.assign(env, { HOME: networkHome, USERPROFILE: networkHome, XDG_CONFIG_HOME: networkHome });
    if (options.token) Object.assign(env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraHeader', GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${options.token}`).toString('base64')}` });
    const fixed = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', `core.hooksPath=${nullFile}`, '-c', `core.attributesFile=${nullFile}`, '-c', 'core.excludesFile=', '-c', 'core.sshCommand=', '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'diff.external=', '-c', 'credential.helper=', '-c', 'credential.interactive=false', '-c', 'http.followRedirects=false', '-c', 'http.sslVerify=true', '-c', 'http.proxy=', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'fetch.recurseSubmodules=false', '-c', 'submodule.recurse=false', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false'];
    return new Promise<Buffer | null>((resolve, reject) => {
      const child = spawn(executable, [...fixed, ...args], { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      const chunks: Buffer[] = []; let bytes = 0; let failed = false;
      const timer = setTimeout(() => { failed = true; child.kill(); }, options.network ? 45000 : 10000); timer.unref();
      child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > (options.limit ?? 1048576)) { failed = true; child.kill(); } else chunks.push(chunk); });
      child.stdin.on('error', () => undefined);
      child.once('error', () => { clearTimeout(timer); reject(new GitError('unavailable', 'Git could not be started. Check the local installation.')); });
      child.once('close', code => { clearTimeout(timer); if (!failed && code === 0) resolve(Buffer.concat(chunks)); else if (options.optional) resolve(null); else reject(new GitError(options.network && failed ? 'uncertain' : 'conflict', options.network ? 'Git synchronization did not complete. Check GitHub permissions and connectivity, then refresh before retrying. No force operation was used.' : 'Git could not safely complete the operation. Refresh the repository and inspect its current state.')); });
      child.stdin.end(options.input);
    }).finally(async () => { if (networkHome) await rm(networkHome, { recursive: true, force: true }); });
  } };
}

export function githubRemote(value: string): string {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})(?:\.git)?\/?$/.exec(value);
  if (!match || /^(?:\.|\.\.)$/.test(match[2]!)) throw new GitError('invalid_request', 'Use an HTTPS github.com repository URL without credentials or query parameters.');
  return `https://github.com/${match[1]}/${match[2]!.replace(/\.git$/, '')}.git`;
}

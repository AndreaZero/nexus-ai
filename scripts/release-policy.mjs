import path from 'node:path';

const platforms = {
  win32: { directory: 'win', flag: '--win', target: 'nsis', extension: 'exe' },
  darwin: { directory: 'mac', flag: '--mac', target: 'dmg', extension: 'dmg' },
  linux: { directory: 'linux', flag: '--linux', target: 'AppImage', extension: 'AppImage' },
};

const signingVariables = [
  'CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME', 'CSC_KEYCHAIN',
  'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD',
  'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID',
  'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER',
  'APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE',
];

export function releasePolicy(platform, architecture, mode, environment = {}) {
  const target = platforms[platform];
  if (!target || !['x64', 'arm64'].includes(architecture)) throw new Error('Unsupported native release host.');
  if (!['unsigned', 'signed'].includes(mode)) throw new Error('Choose unsigned or signed explicitly.');
  const env = { ...environment, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
  if (mode === 'unsigned' || platform === 'linux') {
    for (const key of signingVariables) delete env[key];
  } else if (platform === 'win32') {
    if (!env.WIN_CSC_LINK?.trim() || !env.WIN_CSC_KEY_PASSWORD?.trim()) {
      throw new Error('Signed Windows packaging requires WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD.');
    }
    // Never fall back to a different platform certificate.
    delete env.CSC_LINK;
    delete env.CSC_KEY_PASSWORD;
  } else if (platform === 'darwin') {
    for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
      if (!env[key]?.trim()) throw new Error(`Signed macOS packaging requires ${key}.`);
    }
    env.CSC_NAME = env.CSC_NAME.trim().replace(/^Developer ID Application:\s*/, '');
    if (!env.CSC_NAME || env.CSC_NAME === '-') throw new Error('Signed macOS packaging requires a Developer ID identity name.');
    // Only the explicitly supplied certificate/notarization account is used.
    for (const key of ['CSC_KEYCHAIN', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE']) delete env[key];
  }
  const config = { forceCodeSigning: mode === 'signed' && platform !== 'linux', publish: null };
  if (platform === 'darwin') {
    config.mac = {
      identity: mode === 'signed' ? env.CSC_NAME : '-',
      hardenedRuntime: mode === 'signed',
      notarize: mode === 'signed',
      ...(mode === 'signed' ? { type: 'distribution' } : {}),
    };
  }
  const artifactArchitecture = platform === 'linux' && architecture === 'x64' ? 'x86_64' : architecture;
  return { ...target, platform, architecture, artifactArchitecture, mode, env, config };
}

export function windowsSignatureCommand(environment) {
  const systemRoot = environment.SystemRoot ?? environment.SYSTEMROOT ?? 'C:\\Windows';
  if (!path.win32.isAbsolute(systemRoot)) throw new Error('Windows system directory is unavailable.');
  const directory = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0');
  const env = { ...environment };
  // pwsh can export its PowerShell7 module path to children. Windows PowerShell5
  // must load its own Security module, never an incompatible/user-installed one.
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  env.PSModulePath = path.win32.join(directory, 'Modules');
  return { executable: path.win32.join(directory, 'powershell.exe'), env };
}

export function assertReleaseEvidence(platform, mode, signature) {
  if (mode === 'signed' && platform === 'win32' && signature.status !== 'valid') {
    throw new Error('Signed release refused: Authenticode verification did not succeed.');
  }
  if (mode === 'signed' && platform === 'darwin' && (signature.status !== 'valid' || signature.notarization !== 'validated')) {
    throw new Error('Signed release refused: Developer ID signature and stapled notarization must both validate.');
  }
}

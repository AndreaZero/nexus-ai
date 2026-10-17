import path from 'node:path';

export const APP_URL = 'nexus://app/';
export const DEVELOPMENT_ORIGIN = 'http://127.0.0.1:5173';

export function developmentUrl(value: string | undefined, packaged: boolean): string | undefined {
  if (!value) return undefined;
  if (packaged || value !== DEVELOPMENT_ORIGIN) {
    throw new Error('NEXUS_RENDERER_URL must be http://127.0.0.1:5173 and is only available during development.');
  }
  return value;
}

export function isTrustedRendererUrl(value: string, devUrl?: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (devUrl) return url.origin === DEVELOPMENT_ORIGIN && devUrl === DEVELOPMENT_ORIGIN;
    return url.protocol === 'nexus:' && url.hostname === 'app' && url.port === '';
  } catch {
    return false;
  }
}

export function isTrustedIpcSender(
  candidate: { senderId: number; mainFrame: boolean; url: string },
  windowId: number,
  devUrl?: string,
): boolean {
  return candidate.senderId === windowId && candidate.mainFrame && isTrustedRendererUrl(candidate.url, devUrl);
}

export function isWithinDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

export function rendererAssetPath(requestUrl: string, root: string): string {
  if (!isTrustedRendererUrl(requestUrl)) throw new Error('Invalid renderer origin.');
  // Examine the original spelling before URL normalizes dot segments.
  const raw = requestUrl.replace(/^nexus:\/\/[^/]+/, '').split(/[?#]/, 1)[0] ?? '';
  const decoded = decodeURIComponent(raw || '/');
  if (decoded.includes('\0') || /[\\:%]/.test(decoded) || decoded.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid renderer asset path.');
  }
  const candidate = path.resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
  if (!isWithinDirectory(root, candidate)) throw new Error('Renderer asset outside root.');
  return candidate;
}

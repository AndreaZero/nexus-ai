import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** Nexus-owned credentials only. AAD prevents moving ciphertext between accounts or repositories. */
export function encryptGithubSecret(secret: string, context: string, value: string): string {
  const key = Buffer.from(hkdfSync('sha256', secret, 'nexus-github-v1', 'repository-secrets', 32));
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decryptGithubSecret(secret: string, context: string, value: string): string {
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('GitHub credential unavailable. Reconnect this repository.');
  try {
    const key = Buffer.from(hkdfSync('sha256', secret, 'nexus-github-v1', 'repository-secrets', 32));
    const iv = Buffer.from(parts[1]!, 'base64url'); const tag = Buffer.from(parts[2]!, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(parts[3]!, 'base64url')), decipher.final()]).toString('utf8');
  } catch { throw new Error('GitHub credential unavailable. Reconnect this repository.'); }
}
export function validGithubSignature(secret: string, rawBody: Buffer, signature: string): boolean {
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

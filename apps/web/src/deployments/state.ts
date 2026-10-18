import type { Deployment, EnvironmentHealth } from '@nexus-ai/contracts';
export const checks = ['build', 'tests', 'coverage', 'performance', 'security'] as const;
export function deploymentHref(id: string) { return `#/deployments?id=${encodeURIComponent(id)}`; }
export function currentHealth(health: EnvironmentHealth, now = Date.now()): EnvironmentHealth {
  const observations = health.observations.map(item => ({ ...item, stale: item.stale || Date.parse(item.expiresAt) <= now }));
  const ready = health.required.length > 0 && health.required.every(check => observations.some(item => item.check === check && !item.stale));
  return { ...health, observations, status: ready ? health.status : 'unknown', score: ready ? health.score : null };
}
export function deploymentPreviewUrl(item: Deployment, environmentUrl?: string | null) { return item.previewUrl ?? environmentUrl ?? null; }
export function deploymentTarget(hash: string) { const id = new URLSearchParams(hash.split('?')[1] ?? '').get('id'); return id && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ? id : null; }
export async function pngThumbnail(file: File) {
  if (file.type !== 'image/png' || file.size < 24 || file.size > 262144) throw new Error('Choose a PNG up to 256 KiB and 1280 × 720 pixels.');
  const bytes = new Uint8Array(await file.arrayBuffer()); const signature = [137,80,78,71,13,10,26,10];
  if (signature.some((value, index) => bytes[index] !== value) || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR') throw new Error('Choose a valid PNG thumbnail.');
  const data = new DataView(bytes.buffer); const width = data.getUint32(16); const height = data.getUint32(20);
  if (!width || !height || width > 1280 || height > 720) throw new Error('Thumbnail dimensions must be at most 1280 × 720.');
  return 'data:image/png;base64,' + btoa(Array.from(bytes, value => String.fromCharCode(value)).join(''));
}

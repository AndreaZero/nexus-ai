import type { DeploymentEnvironment, EnvironmentHealth, HealthObservation } from '@nexus-ai/contracts';
import { WorkError } from './work-common.js';

/** A manual result expires from its observed time, never from the time it was uploaded. */
export function validateObservationTime(value: string, now = Date.now()): Date {
  const observed = new Date(value);
  if (!Number.isFinite(observed.getTime()) || observed.getTime() > now + 120_000)
    throw new WorkError('invalid_request', 'Observation time must not be more than two minutes in the future.');
  return observed;
}

export function computeEnvironmentHealth(environment: Pick<DeploymentEnvironment, 'id' | 'requiredChecks'>,
  observations: HealthObservation[], now = new Date()): EnvironmentHealth {
  const items = observations.map(item => ({ ...item, stale: new Date(item.expiresAt).getTime() <= now.getTime() || new Date(item.observedAt).getTime() > now.getTime() }));
  const required = [...new Set(environment.requiredChecks)];
  const current = required.map(check => items.find(item => item.check === check));
  if (required.length === 0 || current.some(item => !item || item.stale))
    return { environmentId: environment.id, status: 'unknown', score: null, required, observations: items, computedAt: now.toISOString() };
  const known = current as HealthObservation[];
  return { environmentId: environment.id, status: known.some(item => item.status === 'fail') ? 'unhealthy'
    : known.some(item => item.status === 'warn') ? 'degraded' : 'healthy',
  score: known.filter(item => item.status === 'pass').length * 100 / required.length, required, observations: items, computedAt: now.toISOString() };
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** No server URL fetch or SVG: only a bounded, structurally valid PNG chosen by a member. */
export function thumbnailBytes(value: string | null): number {
  if (value === null) return 0;
  const prefix = 'data:image/png;base64,';
  if (!value.startsWith(prefix)) throw new WorkError('invalid_request', 'Choose a PNG thumbnail.');
  const encoded = value.slice(prefix.length); const bytes = Buffer.from(encoded, 'base64');
  const invalid = () => { throw new WorkError('invalid_request', 'Thumbnail must be a valid PNG up to 256 KiB and 1280 × 720 pixels.'); };
  if (bytes.length > 256 * 1024 || bytes.length < 57 || bytes.toString('base64') !== encoded || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) invalid();
  let offset = 8; let header = false; let image = false; let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); const end = offset + 12 + length;
    if (end > bytes.length || ended) invalid();
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (bytes.readUInt32BE(end - 4) !== crc32(bytes.subarray(offset + 4, end - 4))) invalid();
    if (!header) {
      if (kind !== 'IHDR' || length !== 13) invalid();
      const width = bytes.readUInt32BE(offset + 8); const height = bytes.readUInt32BE(offset + 12);
      if (width === 0 || height === 0 || width > 1280 || height > 720) invalid();
      header = true;
    } else if (kind === 'IHDR') invalid();
    if (kind === 'IDAT') image = true;
    if (kind === 'IEND') { if (length !== 0 || !image) invalid(); ended = true; }
    offset = end;
  }
  if (!ended || offset !== bytes.length) invalid();
  return bytes.length;
}

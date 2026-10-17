import { glow, isLand, point, random, TAU } from './geometry.js';
import { useCanvasScene } from './use-canvas-scene.js';

export interface DecorativeEffectProps {
  className?: string;
  reducedMotion?: boolean;
}

const seeded = random(16387);
const stars = Array.from({ length: 74 }, () => ({ x: seeded() * 225, y: seeded() * 340, size: seeded() * 0.7 + 0.15, alpha: seeded() * 0.55 + 0.12 }));
const landNodes: { longitude: number; latitude: number; brightness: number }[] = [];
for (let latitude = -66; latitude < 79; latitude += 3) {
  for (let longitude = -180; longitude < 180; longitude += 3.3) {
    if (isLand(longitude, latitude)) landNodes.push({ longitude: longitude * Math.PI / 180, latitude: latitude * Math.PI / 180, brightness: seeded() * 0.8 + 0.2 });
  }
}

let surface: HTMLCanvasElement | undefined;

/** The fine topography is generated once, reused at every canvas size and animation frame. */
function planetSurface() {
  if (surface) return surface;
  const resolution = 360;
  surface = document.createElement('canvas');
  surface.width = resolution;
  surface.height = resolution;
  const context = surface.getContext('2d');
  if (!context) return surface;
  const pixels = context.createImageData(resolution, resolution);
  const textureRandom = random(71431);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const nx = (x + 0.5) / (resolution / 2) - 1;
      const ny = (y + 0.5) / (resolution / 2) - 1;
      const square = nx * nx + ny * ny;
      if (square > 1) continue;
      const nz = Math.sqrt(1 - square);
      const latitude = Math.asin(Math.max(-1, Math.min(1, -ny * 0.978 + nz * 0.208))) * 180 / Math.PI;
      const longitude = Math.atan2(nx, nz * 0.978 + ny * 0.208) * 180 / Math.PI + 14;
      const land = isLand(longitude, latitude);
      const grain = textureRandom();
      const relief = (Math.sin(longitude * 0.91 + Math.sin(latitude * 0.47) * 5) * Math.sin(latitude * 0.61 + longitude * 0.23) + 1) * 0.5;
      const light = Math.max(0, nx * 0.54 - ny * 0.66 + nz * 0.3);
      const edge = Math.pow(1 - nz, 3.2);
      const rim = edge * Math.max(0, nx * 0.4 - ny * 0.8 + 0.2);
      const detail = land ? (relief * 9 + grain * 8) * (0.25 + light * 0.75) : grain * 2;
      const index = (y * resolution + x) * 4;
      pixels.data[index] = 2 + light * 2 + detail * 0.22 + rim * 8;
      pixels.data[index + 1] = 8 + light * 7 + detail * 0.7 + rim * 27;
      pixels.data[index + 2] = 17 + light * 17 + detail * 1.8 + rim * 93;
      pixels.data[index + 3] = Math.min(255, (1 - square) * 1500);
    }
  }
  context.putImageData(pixels, 0, 0);
  return surface;
}

function project(longitude: number, latitude: number, rotation: number) {
  const angle = longitude - 14 * Math.PI / 180 + rotation;
  const x = Math.cos(latitude) * Math.sin(angle);
  const y = -Math.sin(latitude) * 0.978 + Math.cos(latitude) * Math.cos(angle) * 0.208;
  const z = Math.cos(latitude) * Math.cos(angle) * 0.978 + Math.sin(latitude) * 0.208;
  return { x, y, z };
}

function paintPlanet(context: CanvasRenderingContext2D, width: number, height: number, seconds: number) {
  const scale = Math.min(width / 200, height / 340);
  context.save();
  context.translate((width - 200 * scale) / 2, (height - 340 * scale) / 2);
  context.scale(scale, scale);
  const cx = 68;
  const cy = 178;
  const radius = 145;
  const drift = Math.sin(seconds / 60) * 0.05;

  for (const star of stars) {
    const alpha = star.alpha * (0.75 + Math.sin(seconds * 0.25 + star.x) * 0.25);
    point(context, star.x, star.y, star.size, `rgba(23,105,216,${alpha})`);
  }

  glow(context, cx + 52, cy - 107, 107, '11,59,212', 0.18);
  context.save();
  context.translate(cx - 4, cy - 8);
  context.rotate(-0.6);
  context.beginPath();
  context.ellipse(0, 0, 177, 123, 0, Math.PI * 0.92, Math.PI * 1.98);
  context.strokeStyle = 'rgba(46,106,230,0.35)';
  context.lineWidth = 0.65;
  context.stroke();
  context.restore();

  context.drawImage(planetSurface(), cx - radius, cy - radius, radius * 2, radius * 2);
  context.save();
  context.beginPath();
  context.arc(cx, cy, radius, 0, TAU);
  context.clip();

  // Fine projected continental mesh remains subdued under the bright atmosphere.
  for (const node of landNodes) {
    const projected = project(node.longitude, node.latitude, drift);
    if (projected.z < 0.025) continue;
    const light = Math.max(0.06, projected.x * 0.3 - projected.y * 0.55 + 0.22);
    const alpha = node.brightness * light * (0.12 + projected.z * 0.2);
    const x = cx + projected.x * radius;
    const y = cy + projected.y * radius;
    point(context, x, y, 0.33 + node.brightness * 0.25, `rgba(55,126,239,${alpha})`);
    if (node.brightness > 0.75) {
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + projected.z * 3.4, y + 2.1);
      context.strokeStyle = `rgba(31,95,175,${alpha * 0.75})`;
      context.lineWidth = 0.4;
      context.stroke();
    }
  }

  // Sparse great-circle routes are decorative, unrelated to device activity.
  for (let route = 0; route < 4; route++) {
    context.beginPath();
    let started = false;
    for (let step = 0; step <= 75; step++) {
      const longitude = -1.1 + step / 75 * 2.3;
      const latitude = Math.sin(longitude * 1.5 + route * 0.43) * 0.4 + route * 0.25 - 0.45;
      const p = project(longitude, latitude, drift);
      if (p.z < 0) { started = false; continue; }
      if (started) context.lineTo(cx + p.x * radius, cy + p.y * radius);
      else { context.moveTo(cx + p.x * radius, cy + p.y * radius); started = true; }
    }
    context.strokeStyle = `rgba(29,102,188,${0.07 + route * 0.012})`;
    context.lineWidth = 0.55;
    context.stroke();
  }
  context.restore();

  // An uneven lit limb, rather than an evenly neon-outlined circle.
  const atmosphere = context.createLinearGradient(cx - 90, cy + 70, cx + 125, cy - 110);
  atmosphere.addColorStop(0, 'rgba(4,32,63,0)');
  atmosphere.addColorStop(0.58, 'rgba(19,65,161,0.2)');
  atmosphere.addColorStop(0.8, 'rgba(46,82,255,0.9)');
  atmosphere.addColorStop(0.94, 'rgba(45,143,255,0.95)');
  atmosphere.addColorStop(1, 'rgba(93,194,255,0.35)');
  context.beginPath();
  context.arc(cx, cy, radius, Math.PI * 1.05, Math.PI * 2.58);
  context.strokeStyle = atmosphere;
  context.lineWidth = 1.6;
  context.shadowBlur = 8;
  context.shadowColor = '#145bff';
  context.stroke();
  context.shadowBlur = 0;
  glow(context, cx + 94, cy - 109, 20, '41,110,255', 0.55);
  glow(context, cx + 106, cy - 98, 6, '73,182,255', 0.7);

  context.save();
  context.translate(cx - 3, cy - 5);
  context.rotate(-0.58);
  const orbit = context.createLinearGradient(-172, 0, 172, 0);
  orbit.addColorStop(0, 'rgba(20,76,135,0.05)');
  orbit.addColorStop(0.55, 'rgba(42,98,212,0.22)');
  orbit.addColorStop(0.85, 'rgba(73,104,255,0.55)');
  orbit.addColorStop(1, 'rgba(37,160,255,0.8)');
  context.beginPath();
  context.ellipse(0, 0, 178, 120, 0, -0.1, Math.PI * 0.96);
  context.strokeStyle = orbit;
  context.lineWidth = 0.75;
  context.stroke();
  context.beginPath();
  context.ellipse(0, 0, 167, 135, 0, 0.25, Math.PI * 0.83);
  context.strokeStyle = 'rgba(89,63,210,0.2)';
  context.lineWidth = 0.65;
  context.stroke();
  context.restore();

  for (const spark of [{ x: 184, y: 285 }, { x: 27, y: 206 }, { x: 156, y: 94 }, { x: 112, y: 307 }]) {
    glow(context, spark.x, spark.y, 7, '15,132,255', 0.4);
    point(context, spark.x, spark.y, 0.9, '#8fddff');
  }
  // Preserve room and contrast for the sidebar's DOM payoff.
  const fade = context.createLinearGradient(0, 168, 0, 290);
  fade.addColorStop(0, 'rgba(4,12,19,0)');
  fade.addColorStop(0.6, 'rgba(4,12,19,0.47)');
  fade.addColorStop(1, 'rgba(4,12,19,0.14)');
  context.fillStyle = fade;
  context.fillRect(0, 168, 200, 140);
  context.restore();
}

export function SidebarPlanet({ className, reducedMotion }: DecorativeEffectProps) {
  const canvasRef = useCanvasScene(paintPlanet, reducedMotion);
  return <canvas ref={canvasRef} className={`nexus-effect nexus-effect--planet ${className ?? ''}`} aria-hidden="true" />;
}

import { useCallback } from 'react';
import { glow, point, random, TAU } from './geometry.js';
import type { DecorativeEffectProps } from './SidebarPlanet.js';
import { useCanvasScene } from './use-canvas-scene.js';

export interface AmbientWaveProps extends DecorativeEffectProps {
  variant?: 'pulse' | 'header' | 'activity';
}

const seeded = random(871);
const scatter = Array.from({ length: 86 }, () => ({ x: seeded(), y: seeded(), alpha: seeded() * 0.4 }));

function surfaceY(x: number, depth: number, seconds: number) {
  const crest = Math.sin(x * 8.7 + depth * 4.5 - seconds * 0.16) * 0.19;
  const valley = Math.sin(x * 17.1 - depth * 2.8 + seconds * 0.12) * 0.06;
  return 0.5 + depth * 0.46 + (crest + valley) * (0.42 + depth * 0.58);
}

function paintPulse(context: CanvasRenderingContext2D, width: number, height: number, seconds: number) {
  context.save();
  const fade = context.createLinearGradient(0, 0, width, 0);
  fade.addColorStop(0, 'rgba(0,29,100,0)');
  fade.addColorStop(0.4, 'rgba(0,47,134,0.07)');
  fade.addColorStop(0.82, 'rgba(0,66,150,0.12)');
  fade.addColorStop(1, 'rgba(0,29,100,0)');
  context.fillStyle = fade;
  context.fillRect(0, 0, width, height);

  // Perspective point surface: 24 rows × 33 columns, without a synthetic data series.
  for (let row = 0; row < 24; row++) {
    const depth = row / 23;
    for (let column = 0; column < 33; column++) {
      const u = column / 32;
      const x = (u - 0.5) * (0.7 + depth * 0.3) + 0.51;
      const y = surfaceY(u, depth, seconds) - (1 - depth) * 0.25;
      const edgeFade = Math.sin(u * Math.PI);
      const alpha = (0.15 + depth * 0.44) * edgeFade;
      point(context, x * width, y * height, 0.4 + depth * 0.42, `rgba(${row % 3 === 0 ? '18,112,246' : '0,142,239'},${alpha})`);
    }
  }

  // Hairline curves provide the layered contour seen behind the hero's nodes.
  for (let line = 0; line < 7; line++) {
    const depth = line / 6;
    context.beginPath();
    for (let step = 0; step <= 80; step++) {
      const u = step / 80;
      const y = surfaceY(u, depth, seconds) - (1 - depth) * 0.23;
      if (step === 0) context.moveTo(u * width, y * height);
      else context.lineTo(u * width, y * height);
    }
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(0,90,245,0)');
    gradient.addColorStop(0.28, `rgba(0,103,255,${line % 3 === 0 ? 0.85 : 0.22})`);
    gradient.addColorStop(0.6, `rgba(0,169,255,${line % 3 === 0 ? 0.85 : 0.28})`);
    gradient.addColorStop(0.87, 'rgba(55,78,235,0.3)');
    gradient.addColorStop(1, 'rgba(36,51,150,0)');
    context.strokeStyle = gradient;
    context.lineWidth = line % 3 === 0 ? 1 : 0.45;
    if (line % 3 === 0) { context.shadowBlur = 5; context.shadowColor = '#006fff'; }
    context.stroke();
    context.shadowBlur = 0;
  }

  const route = (u: number) => 0.47 + Math.sin(u * 9.5 + 0.1) * 0.135 + Math.sin(u * 17.3 + seconds * 0.12) * 0.018;
  const routeGradient = context.createLinearGradient(0, 0, width, 0);
  routeGradient.addColorStop(0, 'rgba(0,140,255,0)');
  routeGradient.addColorStop(0.24, 'rgba(23,174,255,0.85)');
  routeGradient.addColorStop(0.58, 'rgba(42,202,255,0.94)');
  routeGradient.addColorStop(1, 'rgba(72,83,255,0.08)');
  context.beginPath();
  for (let step = 0; step <= 90; step++) {
    const u = step / 90;
    if (step === 0) context.moveTo(0, route(u) * height);
    else context.lineTo(u * width, route(u) * height);
  }
  context.strokeStyle = routeGradient;
  context.lineWidth = 1;
  context.shadowColor = '#067dff';
  context.shadowBlur = 8;
  context.stroke();
  context.shadowBlur = 0;

  for (const u of [0.26, 0.54, 0.73]) {
    const x = u * width;
    const y = route(u) * height;
    glow(context, x, y, 20, '0,110,255', 0.55);
    glow(context, x, y, 8, '0,204,255', 0.8);
    context.beginPath();
    context.arc(x, y, 7, 0, TAU);
    context.strokeStyle = 'rgba(27,178,255,0.72)';
    context.lineWidth = 0.75;
    context.stroke();
    point(context, x, y, 2.2, '#b8efff');
    context.beginPath();
    context.moveTo(x, y + 8);
    context.lineTo(x, y + 27);
    context.strokeStyle = 'rgba(49,140,235,0.4)';
    context.lineWidth = 0.6;
    context.stroke();
    point(context, x, y + 31, 3.3, 'rgba(35,152,241,0.75)');
  }

  for (const particle of scatter) {
    const y = particle.y + Math.sin(seconds * 0.07 + particle.x * 7) * 0.012;
    point(context, particle.x * width, y * height, 0.45, `rgba(0,129,255,${particle.alpha})`);
  }
  context.restore();
}

function paintHeader(context: CanvasRenderingContext2D, width: number, height: number, seconds: number) {
  const wave = (u: number, offset = 0) => height * (0.51 + Math.sin(u * 13.5 + offset - seconds * 0.18) * 0.25 * Math.sin(u * Math.PI) + Math.sin(u * 20) * 0.08);
  for (let layer = 2; layer >= 0; layer--) {
    context.beginPath();
    for (let step = 0; step <= 60; step++) {
      const u = step / 60;
      const y = wave(u, layer * 0.6) + layer * 2;
      if (step === 0) context.moveTo(0, y);
      else context.lineTo(u * width, y);
    }
    const line = context.createLinearGradient(0, 0, width, 0);
    line.addColorStop(0, 'rgba(0,147,232,0)');
    line.addColorStop(0.25, `rgba(0,168,252,${layer === 0 ? 0.9 : 0.14})`);
    line.addColorStop(0.7, `rgba(18,196,244,${layer === 0 ? 0.7 : 0.08})`);
    line.addColorStop(1, 'rgba(27,115,180,0)');
    context.strokeStyle = line;
    context.lineWidth = layer === 0 ? 0.7 : 0.5;
    context.stroke();
  }
  for (const u of [0.13, 0.3, 0.47, 0.58, 0.7, 0.82]) {
    const x = u * width;
    const y = wave(u);
    glow(context, x, y, 4.5, '0,164,255', 0.4);
    point(context, x, y, 1.2, 'rgba(51,220,255,0.9)');
  }
}

function paintActivity(context: CanvasRenderingContext2D, width: number, height: number, seconds: number) {
  // A compact holographic wire sculpture, deliberately distinct from measured telemetry.
  const base = height * 0.82;
  const columns = 10;
  for (let index = 0; index < columns; index++) {
    const u = index / (columns - 1);
    const x = width * (0.12 + u * 0.8);
    const top = base - height * (0.15 + Math.sin(u * 7.8 + seconds * 0.12) * 0.12 + u * 0.46);
    const columnWidth = width * 0.045;
    const gradient = context.createLinearGradient(x, top, x, base);
    gradient.addColorStop(0, 'rgba(41,114,255,0.36)');
    gradient.addColorStop(1, 'rgba(10,74,158,0.02)');
    context.fillStyle = gradient;
    context.fillRect(x, top, columnWidth, base - top);
    context.beginPath();
    context.moveTo(x, base);
    context.lineTo(x, top);
    context.lineTo(x + columnWidth, top - columnWidth * 0.45);
    context.lineTo(x + columnWidth, base - columnWidth * 0.45);
    context.strokeStyle = 'rgba(26,104,211,0.36)';
    context.lineWidth = 0.5;
    context.stroke();
    point(context, x, top, 0.9, '#51a9ff');
  }
  for (const particle of scatter.slice(0, 32)) {
    point(context, particle.x * width, particle.y * height, 0.5, `rgba(0,134,255,${particle.alpha})`);
  }
}

export function AmbientWave({ className, variant = 'pulse', reducedMotion }: AmbientWaveProps) {
  const paint = useCallback((context: CanvasRenderingContext2D, width: number, height: number, seconds: number) => {
    if (variant === 'pulse') paintPulse(context, width, height, seconds);
    else if (variant === 'header') paintHeader(context, width, height, seconds);
    else paintActivity(context, width, height, seconds);
  }, [variant]);
  const canvasRef = useCanvasScene(paint, reducedMotion);
  return <canvas ref={canvasRef} className={`nexus-effect nexus-effect--${variant} ${className ?? ''}`} aria-hidden="true" />;
}

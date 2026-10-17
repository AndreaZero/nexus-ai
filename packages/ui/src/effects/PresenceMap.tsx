import { glow, isLand, point } from './geometry.js';
import type { DecorativeEffectProps } from './SidebarPlanet.js';
import { useCanvasScene } from './use-canvas-scene.js';

const mapDots: { x: number; y: number }[] = [];
for (let latitude = -55; latitude < 78; latitude += 7) {
  for (let longitude = -173; longitude < 180; longitude += 7) {
    if (isLand(longitude, latitude)) mapDots.push({ x: (longitude + 180) / 360, y: (83 - latitude) / 145 });
  }
}

function paintMap(context: CanvasRenderingContext2D, width: number, height: number, seconds: number) {
  const mapWidth = Math.min(width, height * 3.25);
  const mapHeight = mapWidth / 3.25;
  const offsetX = (width - mapWidth) / 2;
  const offsetY = (height - mapHeight) / 2;
  context.save();
  context.translate(offsetX, offsetY);
  for (const dot of mapDots) {
    const alpha = 0.15 + Math.sin(dot.x * Math.PI) * 0.28;
    point(context, dot.x * mapWidth, dot.y * mapHeight, Math.max(0.55, mapWidth / 250), `rgba(20,107,197,${alpha})`);
  }

  // Schematic links only; these do not encode user locations, counts, or presence.
  const nodes = [{ x: 0.2, y: 0.31 }, { x: 0.48, y: 0.5 }, { x: 0.73, y: 0.12 }];
  const [first, second, third] = nodes;
  if (first && second && third) {
    context.beginPath();
    context.moveTo(first.x * mapWidth, first.y * mapHeight);
    context.bezierCurveTo(mapWidth * 0.31, -mapHeight * 0.11, mapWidth * 0.31, mapHeight * 0.9, second.x * mapWidth, second.y * mapHeight);
    context.bezierCurveTo(mapWidth * 0.58, mapHeight * 0.39, mapWidth * 0.67, mapHeight * 0.24, third.x * mapWidth, third.y * mapHeight);
    context.strokeStyle = 'rgba(24,115,240,0.48)';
    context.lineWidth = 0.7;
    context.stroke();
  }
  for (const node of nodes) {
    const x = node.x * mapWidth;
    const y = node.y * mapHeight;
    const intensity = 0.48 + Math.sin(seconds * 0.22 + node.x * 9) * 0.08;
    glow(context, x, y, 8, '0,130,255', intensity);
    point(context, x, y, 1.7, '#87ccff');
  }
  context.restore();
}

export function PresenceMap({ className, reducedMotion }: DecorativeEffectProps) {
  const canvasRef = useCanvasScene(paintMap, reducedMotion);
  return <canvas ref={canvasRef} className={`nexus-effect nexus-effect--map ${className ?? ''}`} aria-hidden="true" />;
}

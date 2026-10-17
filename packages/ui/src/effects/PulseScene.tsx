import { useCallback } from 'react';
import type { CSSProperties } from 'react';
import { glow, point, random } from './geometry.js';
import { useCanvasScene } from './use-canvas-scene.js';

export interface PulseSceneMilestone {
  id: string;
  title: string;
  state: 'completed' | 'in_progress' | 'planned';
  progress: number | null;
}

export interface PulseSceneProps {
  milestones: readonly PulseSceneMilestone[];
  reducedMotion: boolean;
  onSelect?: (id: string) => void;
  activeId?: string | null;
  className?: string;
}

// Schematic screen positions from reference 1, not dates or inferred task effort.
const anchors = [
  { x: 5, y: 56, label: 'right' },
  { x: 31, y: 73, label: 'right' },
  { x: 48, y: 33, label: 'above' },
  { x: 64, y: 72, label: 'right' },
  { x: 82, y: 43, label: 'right' },
] as const;
const seed = random(4107);
const particles = Array.from({ length: 76 }, () => ({ x: seed(), y: seed(), opacity: 0.1 + seed() * 0.27 }));
const stateLabels: Record<PulseSceneMilestone['state'], string> = {
  completed: 'Completed',
  in_progress: 'In progress',
  planned: 'Planned',
};

function waveY(u: number, depth: number, seconds: number) {
  const primary = Math.sin(u * 10.8 + depth * 3.4 - seconds * 0.16);
  const secondary = Math.sin(u * 20.5 - depth * 5.1 + seconds * 0.1);
  return 0.29 + depth * 0.68 + primary * (0.08 + depth * 0.045) + secondary * 0.025;
}

function paintSurface(context: CanvasRenderingContext2D, width: number, height: number, seconds: number) {
  context.save();
  // Ambient light is independent of milestone state and carries no activity meaning.
  glow(context, width * 0.48, height * 0.58, Math.min(width * 0.4, height * 0.95), '0,82,220', 0.21);
  glow(context, width * 0.8, height * 0.49, Math.min(width * 0.22, height * 0.58), '65,38,171', 0.12);
  // A dense holographic fabric, bounded at 3,200 points rather than a data chart.
  for (let row = 0; row < 40; row++) {
    const depth = row / 39;
    for (let column = 0; column < 80; column++) {
      const u = column / 79;
      const x = width * ((u - 0.5) * (0.77 + depth * 0.23) + 0.5);
      const y = height * waveY(u, depth, seconds);
      const crestLight = Math.pow(Math.max(0, -Math.sin(u * 10.8 + depth * 3.4 - seconds * 0.16)), 3);
      const alpha = Math.sin(u * Math.PI) * (0.2 + depth * 0.22 + crestLight * 0.28);
      const color = u > 0.67 && row % 5 === 0 ? '89,86,255' : row % 4 === 0 ? '16,104,255' : '0,166,255';
      point(context, x, y, 0.42 + depth * 0.27 + crestLight * 0.16, `rgba(${color},${alpha})`);
    }
  }
  for (let layer = 0; layer < 10; layer++) {
    const depth = layer / 9;
    context.beginPath();
    for (let step = 0; step <= 90; step++) {
      const u = step / 90;
      const x = u * width;
      const y = height * waveY(u, depth, seconds);
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    const stroke = context.createLinearGradient(0, 0, width, 0);
    stroke.addColorStop(0, 'rgba(0,77,211,0)');
    stroke.addColorStop(0.27, `rgba(0,113,255,${layer % 3 === 0 ? 0.92 : 0.2})`);
    stroke.addColorStop(0.55, `rgba(0,191,255,${layer % 3 === 0 ? 0.96 : 0.3})`);
    stroke.addColorStop(0.83, 'rgba(90,72,245,0.38)');
    stroke.addColorStop(1, 'rgba(34,77,177,0)');
    context.strokeStyle = stroke;
    context.lineWidth = layer % 3 === 0 ? 1 : 0.45;
    context.shadowBlur = layer % 3 === 0 ? 7 : 0;
    context.shadowColor = '#0866ff';
    context.stroke();
  }
  context.shadowBlur = 0;
  for (const particle of particles) {
    const y = particle.y + Math.sin(seconds * 0.1 + particle.x * 8) * 0.012;
    point(context, particle.x * width, y * height, 0.5, `rgba(20,133,255,${particle.opacity})`);
  }
  context.restore();
}

function progressLabel(progress: number | null) {
  return progress !== null && Number.isFinite(progress)
    ? `${Math.round(Math.max(0, Math.min(100, progress)))}%`
    : 'Progress unavailable';
}

/** Ambient surface plus real milestone markers. The caller owns hero copy and the progress ring. */
export function PulseScene({ milestones, reducedMotion, onSelect, activeId, className }: PulseSceneProps) {
  const paint = useCallback(paintSurface, []);
  const canvasRef = useCanvasScene(paint, reducedMotion);
  const visible = milestones.slice(0, anchors.length);

  return (
    <div className={`nexus-pulse-scene ${className ?? ''}`}>
      <div className="nexus-pulse-scene__surface">
        <canvas className="nexus-effect nexus-pulse-scene__canvas" ref={canvasRef} aria-hidden="true" />
        {visible.length > 1 && (
          <svg className="nexus-pulse-scene__connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {visible.slice(1).map((milestone, index) => {
              const previous = anchors[index];
              const current = anchors[index + 1];
              if (!previous || !current) return null;
              return <path key={milestone.id} d={`M${previous.x},${previous.y} Q${(previous.x + current.x) / 2},${Math.min(previous.y, current.y) - 13} ${current.x},${current.y}`} />;
            })}
          </svg>
        )}
        {visible.length > 0 && (
          <div className="nexus-pulse-scene__milestones" role="group" aria-label="Project milestones">
            {visible.map((milestone, index) => {
              const anchor = anchors[index];
              if (!anchor) return null;
              const style = { '--pulse-x': `${anchor.x}%`, '--pulse-y': `${anchor.y}%` } as CSSProperties;
              const title = `${milestone.title} · ${stateLabels[milestone.state]} · ${progressLabel(milestone.progress)}`;
              const content = <><span className="nexus-pulse-scene__marker" aria-hidden="true"><span /></span><span className={`nexus-pulse-scene__label nexus-pulse-scene__label--${anchor.label}`}><span>{milestone.title}</span><small>{stateLabels[milestone.state]}</small></span></>;
              const markerClass = `nexus-pulse-scene__node nexus-pulse-scene__node--${milestone.state}${activeId === milestone.id ? ' is-active' : ''}`;
              return onSelect ? (
                <button key={milestone.id} type="button" className={markerClass} style={style} title={title} aria-label={title} aria-pressed={activeId === milestone.id} onClick={() => onSelect(milestone.id)}>{content}</button>
              ) : <div key={milestone.id} className={markerClass} style={style} title={title} role="img" aria-label={title}>{content}</div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

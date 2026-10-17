import { useEffect, useRef } from 'react';

export type ScenePainter = (context: CanvasRenderingContext2D, width: number, height: number, seconds: number) => void;

/** One clock per decorative scene. Background and offscreen scenes allocate no frames. */
export function useCanvasScene(paint: ScenePainter, reducedMotion?: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let frame: number | undefined;
    let inViewport = true;
    let seconds = 0;
    let lastFrame = 0;
    let lastPaint = 0;

    const motionAllowed = () => !reducedMotion && !media.matches;
    const canRun = () => motionAllowed() && inViewport && document.visibilityState !== 'hidden' && width > 0 && height > 0;
    const draw = () => {
      context.clearRect(0, 0, width, height);
      paint(context, width, height, motionAllowed() ? seconds : 0);
    };
    const stop = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      lastFrame = 0;
      lastPaint = 0;
    };
    const tick = (now: number) => {
      frame = undefined;
      if (!canRun()) return;
      if (lastFrame) seconds += Math.min(now - lastFrame, 100) / 1000;
      lastFrame = now;
      if (!lastPaint || now - lastPaint >= 1000 / 30 - 0.5) {
        draw();
        lastPaint = now;
      }
      frame = window.requestAnimationFrame(tick);
    };
    const resume = () => {
      if (canRun() && frame === undefined) frame = window.requestAnimationFrame(tick);
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (width > 0 && height > 0) draw();
      if (!canRun()) stop();
      else resume();
    };
    const visibility = () => {
      if (canRun()) resume();
      else stop();
    };
    const motion = () => {
      stop();
      draw();
      resume();
    };
    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inViewport = entry?.isIntersecting ?? false;
      visibility();
    });
    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    document.addEventListener('visibilitychange', visibility);
    media.addEventListener('change', motion);
    window.addEventListener('resize', resize);
    resize();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', motion);
      window.removeEventListener('resize', resize);
    };
  }, [paint, reducedMotion]);

  return canvasRef;
}

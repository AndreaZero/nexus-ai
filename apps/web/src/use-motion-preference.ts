import { useEffect, useState } from 'react';

const motionStorageKey = 'nexus.reduce-motion';

function readPreference(): boolean {
  try { return window.localStorage.getItem(motionStorageKey) === 'true'; }
  catch { return false; }
}

export function useMotionPreference() {
  const [reduceRequested, setReduceRequested] = useState(readPreference);
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const reducedMotion = reduceRequested || systemReduced;
  useEffect(() => {
    document.documentElement.dataset['reducedMotion'] = String(reducedMotion);
  }, [reducedMotion]);

  const toggle = () => setReduceRequested((previous) => {
    const next = !previous;
    try { window.localStorage.setItem(motionStorageKey, String(next)); }
    catch { /* The preference remains active for this application session. */ }
    return next;
  });

  return { reducedMotion, reduceRequested, systemReduced, toggle };
}

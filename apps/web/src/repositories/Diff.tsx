import { useState } from 'react';
import { Button, EmptyPanel } from '@nexus-ai/ui';
import { DiffViewer } from '../session/CodeWorkspace.js';

export function Diff({ patch }: { patch: string | null }) {
  const [split, setSplit] = useState(true);
  return patch ? <div className="repo-diff"><div className="repo-diff-toolbar"><span>{split ? 'Original → Modified' : 'Original / Modified line numbers'}</span><Button size="sm" aria-pressed={split} onClick={() => setSplit(value => !value)}>{split ? 'Switch to unified diff' : 'Switch to split diff'}</Button></div><DiffViewer patch={patch} split={split} /></div> : <EmptyPanel compact title="Text patch unavailable" description="Binary files, oversized patches or metadata-only changes may require inspection in your editor or GitHub." />;
}

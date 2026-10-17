export interface DiffLine { kind: 'context' | 'add' | 'delete' | 'hunk' | 'meta'; text: string; oldLine: number | null; newLine: number | null; }
export interface SplitLine { left: DiffLine | null; right: DiffLine | null; }

// Parse text only: neither patch headers nor file content become HTML or paths to open.
export function parseDiff(patch: string): DiffLine[] {
  let oldLine = 0; let newLine = 0; let inHunk = false;
  return patch.split('\n').slice(0, 10000).flatMap((text): DiffLine[] => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (match) { oldLine = Number(match[1]); newLine = Number(match[2]); inHunk = true; return [{ kind: 'hunk', text, oldLine: null, newLine: null }]; }
    if (text.startsWith('diff --git ')) { inHunk = false; return []; }
    if (!inHunk && /^(--- |\+\+\+ |index |new file mode|deleted file mode|rename |similarity index)/.test(text)) return [];
    if (!inHunk || text === '') return [];
    if (text.startsWith('+')) return [{ kind: 'add', text: text.slice(1), oldLine: null, newLine: newLine++ }];
    if (text.startsWith('-')) return [{ kind: 'delete', text: text.slice(1), oldLine: oldLine++, newLine: null }];
    if (text.startsWith(' ')) return [{ kind: 'context', text: text.slice(1), oldLine: oldLine++, newLine: newLine++ }];
    return [{ kind: 'meta', text, oldLine: null, newLine: null }];
  });
}
export function splitDiff(lines: DiffLine[]): SplitLine[] {
  const result: SplitLine[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    if (line.kind !== 'add' && line.kind !== 'delete') { result.push({ left: line, right: line }); index++; continue; }
    const deleted: DiffLine[] = []; const added: DiffLine[] = [];
    while (index < lines.length && (lines[index]!.kind === 'delete' || lines[index]!.kind === 'add')) {
      const current = lines[index++]!; (current.kind === 'delete' ? deleted : added).push(current);
    }
    for (let row = 0; row < Math.max(deleted.length, added.length); row++) result.push({ left: deleted[row] ?? null, right: added[row] ?? null });
  }
  return result;
}

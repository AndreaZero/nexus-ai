type Line = { kind: ' ' | '+' | '-'; text: string };
const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Bounded LCS, with a whole-region replacement when the changed region is too large. */
export function unifiedDiff(filename: string, before: string, after: string, kind: 'add' | 'update' | 'delete') {
  const old = lines(before); const next = lines(after);
  let prefix = 0;
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < old.length - prefix && suffix < next.length - prefix && old[old.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  const a = old.slice(prefix, old.length - suffix); const b = next.slice(prefix, next.length - suffix);
  const result: Line[] = old.slice(0, prefix).map(text => ({ kind: ' ', text }));
  if ((a.length + 1) * (b.length + 1) <= 1000000) {
    const width = b.length + 1;
    const scores = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
      scores[i * width + j] = a[i] === b[j] ? scores[(i + 1) * width + j + 1]! + 1 : Math.max(scores[(i + 1) * width + j]!, scores[i * width + j + 1]!);
    }
    let i = 0; let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) { result.push({ kind: ' ', text: a[i++]! }); j++; }
      else if (i < a.length && (j === b.length || scores[(i + 1) * width + j]! >= scores[i * width + j + 1]!)) result.push({ kind: '-', text: a[i++]! });
      else result.push({ kind: '+', text: b[j++]! });
    }
  } else { result.push(...a.map(text => ({ kind: '-' as const, text })), ...b.map(text => ({ kind: '+' as const, text }))); }
  result.push(...old.slice(old.length - suffix).map(text => ({ kind: ' ' as const, text })));
  const additions = result.filter(line => line.kind === '+').length;
  const deletions = result.filter(line => line.kind === '-').length;
  const ranges: { start: number; end: number }[] = [];
  for (let i = 0; i < result.length; i++) if (result[i]!.kind !== ' ') {
    const start = Math.max(0, i - 3); const end = Math.min(result.length, i + 4);
    const previous = ranges.at(-1);
    if (previous && start <= previous.end) previous.end = end; else ranges.push({ start, end });
  }
  const header = (side: string) => JSON.stringify(`${side}/${filename}`);
  let diff = `--- ${kind === 'add' ? '/dev/null' : header('a')}\n+++ ${kind === 'delete' ? '/dev/null' : header('b')}\n`;
  for (const range of ranges) {
    const preceding = result.slice(0, range.start);
    const hunk = result.slice(range.start, range.end);
    const oldCount = hunk.filter(line => line.kind !== '+').length;
    const newCount = hunk.filter(line => line.kind !== '-').length;
    const oldStart = preceding.filter(line => line.kind !== '+').length + (oldCount ? 1 : 0);
    const newStart = preceding.filter(line => line.kind !== '-').length + (newCount ? 1 : 0);
    diff += `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n`;
    for (const line of hunk) diff += `${line.kind}${line.text}${line.text.endsWith('\n') ? '' : '\n\\ No newline at end of file\n'}`;
  }
  const data = Buffer.from(diff, 'utf8');
  const truncated = data.length > 65536;
  let end = Math.min(data.length, 65536);
  // Never exceed the byte cap with a replacement character from a cut UTF-8 sequence.
  while (end > 0) {
    try { return { diff: new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, end)), additions, deletions, truncated }; }
    catch { end--; }
  }
  return { diff: '', additions, deletions, truncated };
}

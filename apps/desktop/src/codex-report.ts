import type { CodexTestReport } from '@nexus-ai/contracts';

/** Display plain terminal text; OSC, ANSI and control sequences never reach the renderer. */
export function terminalText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Only complete, recognized reports carry test counts. Exit status alone is never a report. */
export function testReport(itemId: string, output: string): CodexTestReport | null {
  if (output.length > 32768) return null;
  const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000;
  let total: number, passed: number, failed: number, skipped: number;
  let format: 'tap' | 'jest-json';
  let durationMs: number | null = null;
  const source = terminalText(output).trim();
  if (source.startsWith('{') && source.endsWith('}')) {
    try {
      const report = JSON.parse(source) as Record<string, unknown>;
      const values = [report['numTotalTests'], report['numPassedTests'], report['numFailedTests'], report['numPendingTests']];
      if (!values.every(count) || !Array.isArray(report['testResults']) || typeof report['success'] !== 'boolean') return null;
      [total, passed, failed, skipped] = values as [number, number, number, number];
      if (count(report['numTodoTests'])) skipped += report['numTodoTests'];
      format = 'jest-json';
    } catch { return null; }
  } else {
    if (!/^TAP version 13\s*$/m.test(source) || !/^1\.\.\d+\s*$/m.test(source)) return null;
    const summary = (label: string): number | null => {
      const entries = [...source.matchAll(new RegExp(`^# ${label} (\\d+)\\s*$`, 'gm'))];
      if (entries.length !== 1) return null;
      const value = Number(entries[0]![1]); return count(value) ? value : null;
    };
    const values = ['tests', 'pass', 'fail', 'skipped'].map(summary);
    if (values.some(value => value === null)) return null;
    [total, passed, failed, skipped] = values as [number, number, number, number];
    const todo = summary('todo'); if (todo !== null) skipped += todo;
    const duration = source.match(/^# duration_ms (\d+(?:\.\d+)?)\s*$/m);
    if (duration && Number.isFinite(Number(duration[1]))) durationMs = Number(duration[1]);
    format = 'tap';
  }
  if (total !== passed + failed + skipped) return null;
  return { itemId, format, total, passed, failed, skipped, durationMs, observedAt: new Date().toISOString() };
}

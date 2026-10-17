import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBoundaryViolations } from './check-boundaries.mjs';

test('blocks native imports across all module-loading forms', () => {
  for (const code of [
    "import { readFile } from 'node:fs';",
    "export * from '@nexus-ai/codex-bridge';",
    "const x = import('electron');",
    "const x = require('child_process');",
    "import type { X } from '../../desktop/src/main.js';",
    'const x = import(moduleName);',
  ]) assert.ok(findBoundaryViolations(code, 'renderer.ts').length > 0, code);
});

test('allows shared UI/contracts and local code without flagging comments', () => {
  assert.deepEqual(findBoundaryViolations("import { healthResponseSchema } from '@nexus-ai/contracts'; import { EmptyState } from '@nexus-ai/ui'; import './local.js'; // import('node:fs')", 'renderer.ts'), []);
});

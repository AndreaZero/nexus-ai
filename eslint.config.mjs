import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { builtinModules } from 'node:module';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'release/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-imports': ['error', {
        paths: [...builtinModules, 'electron', '@nexus-ai/codex-bridge', '@nexus-ai/db'],
        patterns: ['node:*', '@nexus-ai/desktop', '@nexus-ai/server'],
      }],
    },
  },
);

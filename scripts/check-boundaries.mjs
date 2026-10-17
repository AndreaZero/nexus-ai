import ts from 'typescript';
import { builtinModules } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));
const forbiddenPackages = ['electron', '@nexus-ai/codex-bridge', '@nexus-ai/db', '@nexus-ai/desktop', '@nexus-ai/server'];

export function findBoundaryViolations(source, filename) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const violations = [];
  function check(specifier) {
    if (specifier.startsWith('node:') || builtins.has(specifier) || forbiddenPackages.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
      violations.push(`Import nativo vietato nel renderer: ${specifier}`);
    }
    if (specifier.startsWith('.') && /(?:^|\/)(?:desktop|server|codex-bridge|db)(?:\/|$)/.test(specifier)) {
      violations.push(`Import relativo oltre il confine renderer: ${specifier}`);
    }
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) check(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) check(arg.text);
      else violations.push('Import dinamico non statico nel renderer: specificare un modulo verificabile.');
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return violations;
}

async function sources(directory) {
  const results = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) results.push(...await sources(path));
    else if (/\.(?:ts|tsx)$/.test(item.name)) results.push(path);
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = (await Promise.all(['apps/web/src', 'packages/ui/src', 'packages/contracts/src'].map((path) => sources(resolve(root, path))))).flat();
  const errors = [];
  for (const file of files) errors.push(...findBoundaryViolations(await readFile(file, 'utf8'), file).map((message) => `${file}: ${message}`));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`Confini renderer verificati (${files.length} file).`);
}

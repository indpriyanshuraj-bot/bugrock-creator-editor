#!/usr/bin/env node
// Fails if packages/core stops being pure. This is the rule that keeps one engine instead of two.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const CORE = new URL('../packages/core/src/', import.meta.url).pathname;

const BANNED = [
  [/from\s+['"]node:/, 'node: builtin import'],
  [/from\s+['"](fs|path|os|child_process|crypto|url|util|stream)['"]/, 'bare node builtin import'],
  [/\b(document|window|navigator|localStorage)\s*\./, 'DOM global access'],
  [/from\s+['"]@bugrock\//, 'import from a sibling workspace package'],
  [/\bprocess\.(env|cwd)\b/, 'process global'],
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.ts')) yield full;
  }
}

let failures = 0;
let scanned = 0;

for await (const file of walk(CORE)) {
  scanned++;
  const text = await readFile(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
    for (const [pattern, why] of BANNED) {
      if (pattern.test(line)) {
        failures++;
        console.error(`${relative(process.cwd(), file)}:${i + 1}  ${why}\n  ${line.trim()}`);
      }
    }
  });
}

if (failures > 0) {
  console.error(`\ncore boundary violated (${failures} issue(s)). packages/core must stay pure.`);
  process.exit(1);
}
console.log(`core boundary ok (${scanned} files scanned)`);

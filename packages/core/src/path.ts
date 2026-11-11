// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

/**
 * Virtual, posix-style paths. Never absolute, never contain `..`, always `/`-separated.
 * Paths are relative to the project root that the host was opened with.
 */
export type VPath = string;

const JUNK_NAMES = new Set([
  '.git',
  '.github',
  'node_modules',
  '.DS_Store',
  'Thumbs.db',
  '.mcproject-cache',
  '.bugrock',
]);

export function normalizePath(input: string): VPath {
  if (input.length === 0) return '.';
  const parts = input.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.length === 0 ? '.' : out.join('/');
}

export function joinPath(...segments: readonly string[]): VPath {
  return normalizePath(segments.filter((s) => s.length > 0).join('/'));
}

export function dirname(path: VPath): VPath {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '.' : normalized.slice(0, index);
}

export function basename(path: VPath): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function extname(path: VPath): string {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index).toLowerCase();
}

/** True when `candidate` is `root` or lives underneath it. */
export function isWithin(root: VPath, candidate: VPath): boolean {
  const r = normalizePath(root);
  const c = normalizePath(candidate);
  if (r === '.') return true;
  return c === r || c.startsWith(`${r}/`);
}

export function isJunk(name: string): boolean {
  return JUNK_NAMES.has(name) || name.startsWith('.tmp-');
}

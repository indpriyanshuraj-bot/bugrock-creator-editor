// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import type { VPath } from './path';

export type DiffKind = 'context' | 'add' | 'remove';

export interface DiffLine {
  readonly kind: DiffKind;
  readonly text: string;
}

export interface Hunk {
  /** 1-based line in the before text, where this hunk starts. */
  readonly beforeStart: number;
  /** 1-based line in the after text, where this hunk starts. */
  readonly afterStart: number;
  readonly lines: readonly DiffLine[];
}

export interface FileDiff {
  readonly path: VPath;
  readonly hunks: readonly Hunk[];
  readonly added: number;
  readonly removed: number;
  readonly identical: boolean;
}

interface Op {
  readonly kind: DiffKind;
  readonly text: string;
}

/** Guard against pathological inputs: beyond this, report a whole-file replacement instead. */
const MAX_DP_CELLS = 4_000_000;

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function replaceAll(before: string[], after: string[]): Op[] {
  return [
    ...before.map((text): Op => ({ kind: 'remove', text })),
    ...after.map((text): Op => ({ kind: 'add', text })),
  ];
}

function lcsOps(before: string[], after: string[]): Op[] {
  const n = before.length;
  const m = after.length;
  if (n === 0 && m === 0) return [];
  if (n * m > MAX_DP_CELLS) return replaceAll(before, after);

  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const here = i * width + j;
      if (before[i] === after[j]) {
        dp[here] = (dp[(i + 1) * width + (j + 1)] ?? 0) + 1;
      } else {
        const down = dp[(i + 1) * width + j] ?? 0;
        const right = dp[i * width + (j + 1)] ?? 0;
        dp[here] = down >= right ? down : right;
      }
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({ kind: 'context', text: before[i] ?? '' });
      i += 1;
      j += 1;
      continue;
    }
    const down = dp[(i + 1) * width + j] ?? 0;
    const right = dp[i * width + (j + 1)] ?? 0;
    if (down >= right) {
      ops.push({ kind: 'remove', text: before[i] ?? '' });
      i += 1;
    } else {
      ops.push({ kind: 'add', text: after[j] ?? '' });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ kind: 'remove', text: before[i] ?? '' });
    i += 1;
  }
  while (j < m) {
    ops.push({ kind: 'add', text: after[j] ?? '' });
    j += 1;
  }
  return ops;
}

function groupHunks(ops: readonly Op[], context: number): Hunk[] {
  const changed: number[] = [];
  ops.forEach((op, index) => {
    if (op.kind !== 'context') changed.push(index);
  });
  if (changed.length === 0) return [];

  const ranges: { start: number; end: number }[] = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length, index + context + 1);
    const last = ranges[ranges.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else ranges.push({ start, end });
  }

  // Walk once to know the line numbers at every op index.
  const beforeAt: number[] = [];
  const afterAt: number[] = [];
  let beforeLine = 1;
  let afterLine = 1;
  for (const op of ops) {
    beforeAt.push(beforeLine);
    afterAt.push(afterLine);
    if (op.kind !== 'add') beforeLine += 1;
    if (op.kind !== 'remove') afterLine += 1;
  }

  return ranges.map((range) => ({
    beforeStart: beforeAt[range.start] ?? 1,
    afterStart: afterAt[range.start] ?? 1,
    lines: ops.slice(range.start, range.end),
  }));
}

/** Line diff between two texts. Pure; used for dry runs, the TUI preview and the journal. */
export function diffText(
  before: string,
  after: string,
  context = 3,
): { hunks: Hunk[]; added: number; removed: number } {
  if (before === after) return { hunks: [], added: 0, removed: 0 };
  const ops = lcsOps(splitLines(before), splitLines(after));
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.kind === 'add') added += 1;
    else if (op.kind === 'remove') removed += 1;
  }
  return { hunks: groupHunks(ops, context), added, removed };
}

export function diffFile(path: VPath, before: string, after: string, context = 3): FileDiff {
  const { hunks, added, removed } = diffText(before, after, context);
  return { path, hunks, added, removed, identical: hunks.length === 0 };
}

/** Unified-ish text, which is what a human and a CI log both want. */
export function formatFileDiff(diff: FileDiff): string {
  if (diff.identical) return `${diff.path}: no change`;
  const out: string[] = [`--- a/${diff.path}`, `+++ b/${diff.path}`];
  for (const hunk of diff.hunks) {
    const beforeCount = hunk.lines.filter((line) => line.kind !== 'add').length;
    const afterCount = hunk.lines.filter((line) => line.kind !== 'remove').length;
    out.push(`@@ -${hunk.beforeStart},${beforeCount} +${hunk.afterStart},${afterCount} @@`);
    for (const line of hunk.lines) {
      const prefix = line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' ';
      out.push(`${prefix}${line.text}`);
    }
  }
  return out.join('\n');
}

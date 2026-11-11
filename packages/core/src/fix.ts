// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import { diffFile, type FileDiff } from './diff';
import type { Diagnostic, FixOp } from './diagnostic';
import { readText, type Host } from './host';
import { parseJsonc } from './jsonc';
import { writeJournal, type JournalEntry } from './journal';
import type { VPath } from './path';

export interface ApplyOptions {
  /** Compute diffs and report what would happen without writing anything. */
  readonly dryRun?: boolean;
  /** Default true: record before/after so `undo` works. */
  readonly journal?: boolean;
  readonly now?: () => Date;
  readonly summary?: string;
}

export interface ApplyResult {
  /** Number of individual operations applied (or that would be, on a dry run). */
  readonly applied: number;
  /** Files touched, sorted. */
  readonly files: readonly VPath[];
  readonly diffs: readonly FileDiff[];
  readonly journalId?: string;
  readonly dryRun: boolean;
}

type Container = Record<string, unknown> | unknown[];

export function parsePointer(pointer: string): readonly string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`invalid JSON Pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null;
}

function childOf(container: Container, key: string): unknown {
  return Array.isArray(container) ? container[Number(key)] : container[key];
}

function setChild(container: Container, key: string, value: unknown): void {
  if (Array.isArray(container)) container[Number(key)] = value;
  else container[key] = value;
}

function deleteChild(container: Container, key: string): void {
  if (Array.isArray(container)) container.splice(Number(key), 1);
  else delete container[key];
}

/** Apply one operation to a parsed JSON document, creating intermediate objects as needed. */
export function applyOp(doc: Record<string, unknown>, op: FixOp): void {
  const parts = parsePointer(op.pointer);
  if (parts.length === 0) throw new Error('cannot apply a fix at the document root');

  let current: Container = doc;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (key === undefined) throw new Error(`invalid JSON Pointer: ${op.pointer}`);
    let next = childOf(current, key);
    if (!isContainer(next)) {
      next = {};
      setChild(current, key, next);
    }
    current = next as Container;
  }

  const last = parts[parts.length - 1];
  if (last === undefined) throw new Error(`invalid JSON Pointer: ${op.pointer}`);
  if (op.kind === 'delete') deleteChild(current, last);
  else setChild(current, last, op.value);
}

/** Last pointer segment when it is an array index, else null. */
function numericTail(pointer: string): number | null {
  const parts = parsePointer(pointer);
  const last = parts[parts.length - 1];
  if (last === undefined) return null;
  return /^\d+$/.test(last) ? Number(last) : null;
}

/**
 * Order operations so they cannot invalidate each other.
 *
 * Sets run before deletes (a set's index is valid until something is removed), and deletes on
 * array elements run from the highest index down — otherwise deleting `/dependencies/0` shifts
 * `/dependencies/1` out from under the next operation and silently deletes the wrong entry.
 */
function orderOps(ops: readonly FixOp[]): FixOp[] {
  return [...ops].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'set' ? -1 : 1;
    if (a.kind === 'delete' && b.kind === 'delete') {
      const aIndex = numericTail(a.pointer);
      const bIndex = numericTail(b.pointer);
      if (aIndex !== null && bIndex !== null) return bIndex - aIndex;
    }
    return 0;
  });
}

/**
 * Apply every fix in a diagnostic list, grouped per file so each file is read and written once.
 * Idempotent by construction: a fix sets an absolute value, never a delta. Writes a journal by
 * default, so the change can be undone on a phone, hours later, after the process died.
 */
export async function applyFixes(
  host: Host,
  diagnostics: readonly Diagnostic[],
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const dryRun = options.dryRun ?? false;
  const byFile = new Map<VPath, FixOp[]>();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.fix) continue;
    const ops = byFile.get(diagnostic.path) ?? [];
    ops.push(...diagnostic.fix.ops);
    byFile.set(diagnostic.path, ops);
  }

  let applied = 0;
  const files: VPath[] = [];
  const diffs: FileDiff[] = [];
  const entries: JournalEntry[] = [];

  for (const [path, ops] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    const before = await readText(host, path);
    const parsed = parseJsonc(before);
    if (!parsed.ok) {
      throw new Error(
        `${path} is not parseable: ${parsed.issue.message} (line ${parsed.issue.line}, column ${parsed.issue.column})`,
      );
    }
    const doc = parsed.value as Record<string, unknown>;
    for (const op of orderOps(ops)) {
      applyOp(doc, op);
      applied += 1;
    }
    const after = `${JSON.stringify(doc, null, 2)}\n`;

    diffs.push(diffFile(path, before, after));
    files.push(path);
    entries.push({ path, existedBefore: true, before, after });

    if (!dryRun) await host.write(path, after);
  }

  if (dryRun || entries.length === 0) {
    return { applied, files, diffs, dryRun };
  }

  let journalId: string | undefined;
  if (options.journal ?? true) {
    const journal = await writeJournal(host, entries, {
      now: options.now,
      summary: options.summary ?? `${applied} fix(es) across ${entries.length} file(s)`,
    });
    journalId = journal.id;
  }

  return { applied, files, diffs, journalId, dryRun };
}

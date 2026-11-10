// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import type { Diagnostic, FixOp } from './diagnostic';
import { readText, type Host } from './host';
import type { VPath } from './path';

export interface ApplyResult {
  /** Number of individual operations written. */
  readonly applied: number;
  /** Files touched, sorted. */
  readonly files: readonly VPath[];
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

/**
 * Apply every fix in a diagnostic list, grouped per file so each file is read and written once.
 * Idempotent by construction: a fix sets an absolute value, never a delta.
 */
export async function applyFixes(
  host: Host,
  diagnostics: readonly Diagnostic[],
): Promise<ApplyResult> {
  const byFile = new Map<VPath, FixOp[]>();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.fix) continue;
    const ops = byFile.get(diagnostic.path) ?? [];
    ops.push(...diagnostic.fix.ops);
    byFile.set(diagnostic.path, ops);
  }

  let applied = 0;
  const files: VPath[] = [];

  for (const [path, ops] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    const doc = JSON.parse(await readText(host, path)) as Record<string, unknown>;
    for (const op of ops) {
      applyOp(doc, op);
      applied += 1;
    }
    await host.write(path, `${JSON.stringify(doc, null, 2)}\n`);
    files.push(path);
  }

  return { applied, files };
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import type { SourcePosition } from './jsonc';
import type { VPath } from './path';

export type Severity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'BRK001' // manifest is not valid JSON(C)
  | 'BRK002' // format_version missing
  | 'BRK003' // format_version newer than we know
  | 'BRK004' // header missing
  | 'BRK005' // header.uuid missing or invalid
  | 'BRK006' // header.uuid duplicated
  | 'BRK007' // header.name missing
  | 'BRK008' // header.min_engine_version missing
  | 'BRK009' // header.version missing or invalid
  | 'BRK010' // modules missing or empty
  | 'BRK011' // module uuid missing or invalid
  | 'BRK012' // pack_icon.png missing
  | 'BRK013' // dependency uuid does not resolve in this project
  | 'BRK014' // pack_icon.png is not a readable PNG
  | 'BRK015' // pack_icon.png is not square
  | 'BRK016' // pack_icon.png has an unusual size
  | 'BRK017' // module uuid duplicated
  | 'BRK018'; // unknown module type

export const DIAGNOSTIC_TITLES: Readonly<Record<DiagnosticCode, string>> = {
  BRK001: 'manifest is not valid JSON',
  BRK002: 'format_version is missing',
  BRK003: 'format_version is newer than this tool understands',
  BRK004: 'manifest header is missing',
  BRK005: 'header.uuid is missing or not a UUID',
  BRK006: 'header.uuid is duplicated in this project',
  BRK007: 'header.name is missing',
  BRK008: 'header.min_engine_version is missing',
  BRK009: 'header.version is missing or not a version tuple',
  BRK010: 'modules are missing or empty',
  BRK011: 'a module uuid is missing or not a UUID',
  BRK012: 'pack_icon.png is missing',
  BRK013: 'a dependency uuid does not resolve in this project',
  BRK014: 'pack_icon.png is not a readable PNG',
  BRK015: 'pack_icon.png is not square',
  BRK016: 'pack_icon.png has an unusual size',
  BRK017: 'a module uuid is duplicated in this project',
  BRK018: 'a module type is not recognised',
};

/** A single mutation, addressed by JSON Pointer so it survives reformatting. */
export type FixOp =
  | { readonly kind: 'set'; readonly pointer: string; readonly value: unknown }
  | { readonly kind: 'delete'; readonly pointer: string };

export interface Fix {
  readonly summary: string;
  readonly ops: readonly FixOp[];
}

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  readonly message: string;
  /** File the diagnostic belongs to, relative to the project root. */
  readonly path: VPath;
  /** JSON Pointer inside that file, when the problem is a single node. */
  readonly pointer?: string;
  /** Where that pointer starts in the source, when we could parse far enough to know. */
  readonly position?: SourcePosition;
  readonly fix?: Fix;
}

export function isFixable(diagnostic: Diagnostic): boolean {
  return diagnostic.fix !== undefined;
}

export function countBySeverity(
  diagnostics: readonly Diagnostic[],
): Readonly<Record<Severity, number>> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of diagnostics) counts[diagnostic.severity] += 1;
  return counts;
}

/** Deterministic order: file, then position, then code. Two runs must be diffable. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const byPath = a.path.localeCompare(b.path);
    if (byPath !== 0) return byPath;
    const byOffset = (a.position?.offset ?? -1) - (b.position?.offset ?? -1);
    if (byOffset !== 0) return byOffset;
    return a.code.localeCompare(b.code);
  });
}

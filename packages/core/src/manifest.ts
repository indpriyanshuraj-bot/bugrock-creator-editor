// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

export const MANIFEST_FILE = 'manifest.json';

/** format_version values this tool claims to understand. */
export const SUPPORTED_FORMAT_VERSIONS: readonly number[] = [1, 2, 3];

export type PackKind = 'behavior' | 'resource' | 'skin' | 'world_template' | 'unknown';

const MODULE_KIND: Readonly<Record<string, PackKind>> = {
  data: 'behavior',
  script: 'behavior',
  resources: 'resource',
  skin_pack: 'skin',
  world_template: 'world_template',
};

export interface ManifestModule {
  readonly type?: string;
  readonly uuid?: string;
  readonly version?: readonly number[];
  readonly description?: string;
  readonly language?: string;
  readonly entry?: string;
  readonly [key: string]: unknown;
}

export interface ManifestDependency {
  readonly uuid?: string;
  readonly version?: readonly number[];
  readonly module_name?: string;
  readonly [key: string]: unknown;
}

export interface ManifestHeader {
  readonly name?: string;
  readonly description?: string;
  readonly uuid?: string;
  readonly version?: readonly number[];
  readonly min_engine_version?: readonly number[];
  readonly [key: string]: unknown;
}

export interface Manifest {
  readonly format_version?: number;
  readonly header?: ManifestHeader;
  readonly modules?: readonly ManifestModule[];
  readonly dependencies?: readonly ManifestDependency[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export type ParseResult =
  | { readonly ok: true; readonly manifest: Manifest }
  | { readonly ok: false; readonly error: string };

export function parseManifest(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: 'manifest is not a JSON object' };
  }
  return { ok: true, manifest: value as Manifest };
}

export function packKindOf(manifest: Manifest): PackKind {
  for (const module of manifest.modules ?? []) {
    const kind = module.type ? MODULE_KIND[module.type] : undefined;
    if (kind) return kind;
  }
  return 'unknown';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function isVersionTuple(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.every((part) => typeof part === 'number' && Number.isFinite(part))
  );
}

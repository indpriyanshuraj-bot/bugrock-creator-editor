// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

/**
 * What this tool claims to understand about manifest shapes. Kept in one place so "we do not know
 * this yet" is a deliberate, dated decision rather than an accident of a comparison.
 */

export interface ManifestFormat {
  readonly version: number;
  readonly note: string;
}

export const MANIFEST_FORMATS: readonly ManifestFormat[] = [
  { version: 1, note: 'legacy manifests, pre-1.13 add-ons' },
  { version: 2, note: 'the schema in wide use today' },
  { version: 3, note: 'newest schema; not every tool handles it' },
];

export const KNOWN_MANIFEST_FORMATS: readonly number[] = MANIFEST_FORMATS.map((f) => f.version);

export function isKnownManifestFormat(version: number): boolean {
  return KNOWN_MANIFEST_FORMATS.includes(version);
}

/** Module types that map to a content kind we can reason about. */
export const KNOWN_MODULE_TYPES: readonly string[] = [
  'data',
  'resources',
  'script',
  'javascript',
  'skin_pack',
  'world_template',
];

export function isKnownModuleType(type: string): boolean {
  return KNOWN_MODULE_TYPES.includes(type);
}

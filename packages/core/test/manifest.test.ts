// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { isUuid, isVersionTuple, packKindOf, parseManifest } from '../src/index';

describe('manifest', () => {
  it('parses an object', () => {
    const result = parseManifest('{"format_version":2}');
    expect(result.ok).toBe(true);
  });

  it('reports bad JSON with a message', () => {
    const result = parseManifest('{ nope }');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it('rejects non-objects', () => {
    expect(parseManifest('[]').ok).toBe(false);
    expect(parseManifest('"x"').ok).toBe(false);
    expect(parseManifest('null').ok).toBe(false);
  });

  it('classifies pack kind from modules', () => {
    expect(packKindOf({ modules: [{ type: 'data' }] })).toBe('behavior');
    expect(packKindOf({ modules: [{ type: 'script' }] })).toBe('behavior');
    expect(packKindOf({ modules: [{ type: 'resources' }] })).toBe('resource');
    expect(packKindOf({ modules: [{ type: 'skin_pack' }] })).toBe('skin');
    expect(packKindOf({ modules: [] })).toBe('unknown');
    expect(packKindOf({})).toBe('unknown');
  });

  it('validates uuids', () => {
    expect(isUuid('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isUuid('11111111-2222-4333-8444-55555555555')).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it('validates version tuples', () => {
    expect(isVersionTuple([1, 0, 0])).toBe(true);
    expect(isVersionTuple([])).toBe(false);
    expect(isVersionTuple(['1', 0])).toBe(false);
    expect(isVersionTuple(undefined)).toBe(false);
  });
});

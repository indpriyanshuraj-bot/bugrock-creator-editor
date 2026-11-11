// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  isKnownManifestFormat,
  isKnownModuleType,
  KNOWN_MANIFEST_FORMATS,
  MANIFEST_FORMATS,
} from '../src/index';

describe('format registry', () => {
  it('knows the documented manifest formats', () => {
    expect(KNOWN_MANIFEST_FORMATS).toEqual(MANIFEST_FORMATS.map((f) => f.version));
    expect(isKnownManifestFormat(2)).toBe(true);
    expect(isKnownManifestFormat(99)).toBe(false);
  });

  it('knows the module types we can reason about', () => {
    expect(isKnownModuleType('data')).toBe(true);
    expect(isKnownModuleType('resources')).toBe(true);
    expect(isKnownModuleType('script')).toBe(true);
    expect(isKnownModuleType('nonsense')).toBe(false);
  });
});

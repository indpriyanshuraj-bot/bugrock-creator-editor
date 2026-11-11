// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { readPngInfo } from '../src/index';

// A real 1x1 PNG, so the parser is tested against actual bytes rather than a fixture of itself.
const ONE_PIXEL = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

describe('png', () => {
  it('reads the size of a real png', () => {
    expect(readPngInfo(ONE_PIXEL)).toEqual({ width: 1, height: 1 });
  });

  it('rejects a file that is not a png', () => {
    expect(readPngInfo(new TextEncoder().encode('{"not": "a png"}'))).toBeNull();
  });

  it('rejects a truncated png', () => {
    expect(readPngInfo(ONE_PIXEL.slice(0, 12))).toBeNull();
  });

  it('rejects a png whose first chunk is not IHDR', () => {
    const broken = new Uint8Array(ONE_PIXEL);
    broken[12] = 0x58;
    expect(readPngInfo(broken)).toBeNull();
  });
});

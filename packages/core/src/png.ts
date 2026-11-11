// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

export interface PngInfo {
  readonly width: number;
  readonly height: number;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readUint32(bytes: Uint8Array, offset: number): number {
  const a = bytes[offset] ?? 0;
  const b = bytes[offset + 1] ?? 0;
  const c = bytes[offset + 2] ?? 0;
  const d = bytes[offset + 3] ?? 0;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

/**
 * Reads width and height from a PNG's IHDR chunk. Returns null when the bytes are not a PNG we can
 * read — which is itself the useful answer, since the game shows a blank tile for a bad icon.
 */
export function readPngInfo(bytes: Uint8Array): PngInfo | null {
  if (bytes.length < 24) return null;
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (bytes[i] !== SIGNATURE[i]) return null;
  }
  const type = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (type !== 'IHDR') return null;
  return { width: readUint32(bytes, 16), height: readUint32(bytes, 20) };
}

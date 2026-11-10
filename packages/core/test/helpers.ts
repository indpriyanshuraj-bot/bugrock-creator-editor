// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import { MemoryHost } from '../src/index';

export const FIXED_UUID = '11111111-2222-4333-8444-555555555555';

export function uuidSeq(prefix = 1): () => string {
  let n = 0;
  return () => {
    n += 1;
    const tail = String(n).padStart(12, '0');
    return `${String(prefix).padStart(8, '0')}-0000-4000-8000-${tail}`;
  };
}

export function manifestText(overrides: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = {
    format_version: 2,
    header: {
      name: 'test pack',
      description: 'a pack',
      uuid: FIXED_UUID,
      version: [1, 0, 0],
      min_engine_version: [1, 21, 0],
    },
    modules: [{ type: 'data', uuid: '99999999-8888-4777-8666-555555555555', version: [1, 0, 0] }],
  };
  return JSON.stringify({ ...base, ...overrides }, null, 2);
}

export function projectHost(packs: Record<string, Record<string, unknown> | string>): MemoryHost {
  const seed: Record<string, string> = {};
  for (const [dir, manifest] of Object.entries(packs)) {
    seed[`${dir}/manifest.json`] =
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2);
  }
  return new MemoryHost(seed);
}

export function fullManifest(uuid: string, moduleType = 'data'): Record<string, unknown> {
  return {
    format_version: 2,
    header: {
      name: 'pack',
      uuid,
      version: [1, 0, 0],
      min_engine_version: [1, 21, 0],
    },
    modules: [
      { type: moduleType, uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', version: [1, 0, 0] },
    ],
  };
}

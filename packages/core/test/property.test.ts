// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  applyFixes,
  detectProject,
  diagnoseProject,
  isFixable,
  packProject,
  type Host,
} from '../src/index';
import { projectHost, uuidSeq } from './helpers';

/** Deterministic PRNG: a failing seed must reproduce exactly. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  const index = Math.floor(random() * values.length);
  return values[Math.min(index, values.length - 1)] as T;
}

function maybe<T>(random: () => number, value: T, chance = 0.5): T | undefined {
  return random() < chance ? value : undefined;
}

const UUIDS = [
  '11111111-2222-4333-8444-555555555555',
  '22222222-3333-4444-8555-666666666666',
  'not-a-uuid',
  '',
];

function randomManifest(random: () => number, packIndex: number): Record<string, unknown> {
  const manifest: Record<string, unknown> = {};

  const formatVersion = maybe(random, pick(random, [2, 2, 3, 99, 'two']), 0.9);
  if (formatVersion !== undefined) manifest.format_version = formatVersion;

  if (random() < 0.85) {
    const header: Record<string, unknown> = {};
    const uuid = maybe(random, pick(random, UUIDS), 0.8);
    if (uuid !== undefined) header.uuid = uuid;
    const name = maybe(random, pick(random, ['pack', '', 'a pack']), 0.85);
    if (name !== undefined) header.name = name;
    const version = maybe(random, pick(random, [[1, 0, 0], '1.0', []]), 0.8);
    if (version !== undefined) header.version = version;
    if (random() < 0.6) header.min_engine_version = [1, 21, 0];
    manifest.header = header;
  }

  if (random() < 0.85) {
    const count = Math.floor(random() * 3);
    const modules: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i += 1) {
      const module: Record<string, unknown> = {};
      const type = maybe(random, pick(random, ['data', 'resources', 'mystery']), 0.85);
      if (type !== undefined) module.type = type;
      const uuid = maybe(random, pick(random, UUIDS), 0.75);
      if (uuid !== undefined) module.uuid = uuid;
      module.version = [1, 0, 0];
      modules.push(module);
    }
    manifest.modules = modules;
  }

  if (random() < 0.4) {
    manifest.dependencies = [
      { uuid: pick(random, UUIDS), version: [1, 0, 0] },
      ...(random() < 0.3 ? [{ uuid: `dependency-${packIndex}`, version: [1, 0, 0] }] : []),
    ];
  }

  return manifest;
}

async function buildHost(seed: number): Promise<Host> {
  const random = mulberry32(seed);
  const packs: Record<string, Record<string, unknown>> = {};
  const count = 1 + Math.floor(random() * 2);
  for (let i = 0; i < count; i += 1) {
    packs[`pack${i}`] = randomManifest(random, i);
  }
  return projectHost(packs);
}

describe('property: fix is idempotent and never crashes', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i + 1);

  it('leaves zero fixable diagnostics after one apply, for every seed', async () => {
    for (const seed of seeds) {
      const host = await buildHost(seed);
      const project = await detectProject(host, '.');
      const before = await diagnoseProject(host, project, { newUuid: uuidSeq(seed) });

      await applyFixes(host, before, { journal: false });

      const after = await diagnoseProject(host, await detectProject(host, '.'), {
        newUuid: uuidSeq(seed + 1000),
      });
      const stillFixable = after.filter(isFixable);
      expect(stillFixable.map((d) => `${d.code}@${d.path}`)).toEqual([]);
    }
  });

  it('never throws while packing, whatever the manifest looked like', async () => {
    for (const seed of seeds) {
      const host = await buildHost(seed);
      const project = await detectProject(host, '.');
      const bytes = await packProject(host, project);
      expect(bytes.byteLength).toBeGreaterThan(0);
    }
  });

  it('is stable: diagnosing twice gives the same result', async () => {
    for (const seed of seeds.slice(0, 20)) {
      const host = await buildHost(seed);
      const project = await detectProject(host, '.');
      const first = await diagnoseProject(host, project, { newUuid: uuidSeq(seed) });
      const second = await diagnoseProject(host, project, { newUuid: uuidSeq(seed) });
      expect(first.map((d) => d.code)).toEqual(second.map((d) => d.code));
    }
  });
});

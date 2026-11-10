// SPDX-License-Identifier: Apache-2.0

import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { countPackFiles, detectProject, packFileName, packProject } from '../src/index';
import { FIXED_UUID, fullManifest, projectHost } from './helpers';

const OTHER_UUID = '22222222-3333-4444-8555-666666666666';

describe('pack', () => {
  it('bundles both packs under BP and RP folders', async () => {
    const host = projectHost({
      BP: fullManifest(FIXED_UUID, 'data'),
      RP: fullManifest(OTHER_UUID, 'resources'),
    });
    const project = await detectProject(host, '.');
    const bytes = await packProject(host, project);
    const entries = Object.keys(unzipSync(bytes)).sort();
    expect(entries).toEqual(['BP/manifest.json', 'RP/manifest.json']);
  });

  it('is deterministic', async () => {
    const host = projectHost({ BP: fullManifest(FIXED_UUID) });
    const project = await detectProject(host, '.');
    const a = await packProject(host, project);
    const b = await packProject(host, project);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('preserves file contents', async () => {
    const host = projectHost({ BP: fullManifest(FIXED_UUID) });
    await host.write('BP/entities/pig.json', '{"minecraft:pig":{}}');
    const project = await detectProject(host, '.');
    const bytes = await packProject(host, project);
    const entries = unzipSync(bytes);
    expect(strFromU8(entries['BP/entities/pig.json']!)).toBe('{"minecraft:pig":{}}');
  });

  it('counts files and names the archive', async () => {
    const host = projectHost({ 'my-addon/BP': fullManifest(FIXED_UUID) });
    const project = await detectProject(host, '.');
    expect(await countPackFiles(host, project)).toBe(1);
    expect(packFileName(project)).toBe('BP.mcaddon');
  });
});

// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { detectProject, diagnoseProject } from '../src/index';
import { FIXED_UUID, fullManifest, projectHost, uuidSeq } from './helpers';

const OTHER_UUID = '22222222-3333-4444-8555-666666666666';

describe('diagnose', () => {
  it('is quiet on a clean pack', async () => {
    const host = projectHost({ BP: fullManifest(FIXED_UUID) });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    // Only the missing pack_icon is expected on an otherwise clean pack.
    expect(diagnostics.map((d) => d.code)).toEqual(['BRK012']);
  });

  it('finds both packs in a bundle', async () => {
    const host = projectHost({
      BP: fullManifest(FIXED_UUID, 'data'),
      RP: fullManifest(OTHER_UUID, 'resources'),
    });
    const project = await detectProject(host, '.');
    expect(project.packs.map((p) => p.kind)).toEqual(['behavior', 'resource']);
  });

  it('flags a missing uuid and offers a fix', async () => {
    const manifest = fullManifest(FIXED_UUID);
    (manifest.header as Record<string, unknown>).uuid = undefined;
    const host = projectHost({ BP: manifest });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    const found = diagnostics.find((d) => d.code === 'BRK005');
    expect(found).toBeDefined();
    expect(found?.fix?.ops.length).toBe(1);
    expect(found?.pointer).toBe('/header/uuid');
  });

  it('flags a duplicate uuid across packs, once', async () => {
    const host = projectHost({
      BP: fullManifest(FIXED_UUID),
      RP: fullManifest(FIXED_UUID, 'resources'),
    });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    const duplicates = diagnostics.filter((d) => d.code === 'BRK006');
    expect(duplicates.length).toBe(1);
  });

  it('reports unparseable manifests instead of throwing', async () => {
    const host = projectHost({ BP: '{ broken' });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project);
    expect(diagnostics.map((d) => d.code)).toContain('BRK001');
  });

  it('flags missing modules', async () => {
    const host = projectHost({
      BP: { format_version: 2, header: { name: 'x', uuid: FIXED_UUID } },
    });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    expect(diagnostics.map((d) => d.code)).toContain('BRK010');
  });

  it('warns about an unknown future format_version', async () => {
    const manifest = fullManifest(FIXED_UUID);
    manifest.format_version = 99;
    const host = projectHost({ BP: manifest });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    const found = diagnostics.find((d) => d.code === 'BRK003');
    expect(found?.severity).toBe('warning');
  });

  it('ignores junk directories when searching', async () => {
    const host = projectHost({ 'node_modules/pkg': fullManifest(FIXED_UUID) });
    const project = await detectProject(host, '.');
    expect(project.packs.length).toBe(0);
  });
});

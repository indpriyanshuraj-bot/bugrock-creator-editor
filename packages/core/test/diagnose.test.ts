// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { detectProject, diagnoseProject, parseJsonc } from '../src/index';
import { FIXED_UUID, fullManifest, moduleUuidFor, projectHost, uuidSeq } from './helpers';

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
    expect(diagnostics.filter((d) => d.code === 'BRK006').length).toBe(1);
    // The shared module uuid is a duplicate too, reported separately.
    expect(diagnostics.filter((d) => d.code === 'BRK017').length).toBe(1);
  });

  it('reports unparseable manifests with coordinates instead of throwing', async () => {
    const host = projectHost({ BP: '{\n  "format_version": 2,\n  "header" 3\n}' });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project);
    const broken = diagnostics.find((d) => d.code === 'BRK001');
    expect(broken).toBeDefined();
    expect(broken?.position?.line).toBe(3);
  });

  it('accepts JSONC manifests and still reports positions', async () => {
    const source = `{
      // trailing commas are normal in hand-written manifests
      "format_version": 2,
      "header": {
        "name": "jsonc pack",
        "uuid": "${FIXED_UUID}",
        "version": [1, 0, 0],
        "min_engine_version": [1, 21, 0],
      },
      "modules": [{ "type": "data", "uuid": "${moduleUuidFor(FIXED_UUID)}", "version": [1, 0, 0] }],
    }`;
    const host = projectHost({ BP: source });
    const project = await detectProject(host, '.');
    expect(project.packs[0]?.parseError).toBeUndefined();

    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    expect(diagnostics.map((d) => d.code)).toEqual(['BRK012']);
    expect(project.packs[0]?.hasComments).toBe(true);
  });

  it('attaches a source position to positional diagnostics', async () => {
    const manifest = fullManifest(FIXED_UUID);
    (manifest.header as Record<string, unknown>).version = '1.0';
    const host = projectHost({ BP: manifest });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    const version = diagnostics.find((d) => d.code === 'BRK009');
    expect(version?.position?.line).toBeGreaterThan(0);
    expect(version?.position?.column).toBeGreaterThan(0);

    const parsed = parseJsonc(JSON.stringify(manifest, null, 2));
    expect(parsed.ok).toBe(true);
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
    expect(diagnostics.find((d) => d.code === 'BRK003')?.severity).toBe('warning');
  });

  it('warns about an unrecognised module type', async () => {
    const manifest = fullManifest(FIXED_UUID, 'mystery');
    const host = projectHost({ BP: manifest });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    expect(diagnostics.find((d) => d.code === 'BRK018')?.severity).toBe('warning');
  });

  it('warns about a dependency that resolves nowhere, and offers to remove it', async () => {
    const manifest = fullManifest(FIXED_UUID);
    manifest.dependencies = [{ uuid: '99999999-9999-4999-8999-999999999999', version: [1, 0, 0] }];
    const host = projectHost({ BP: manifest });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    const found = diagnostics.find((d) => d.code === 'BRK013');
    expect(found?.severity).toBe('warning');
    expect(found?.fix?.ops[0]).toEqual({ kind: 'delete', pointer: '/dependencies/0' });
  });

  it('resolves a dependency that points at a pack in the project', async () => {
    const manifest = fullManifest(FIXED_UUID);
    manifest.dependencies = [{ uuid: OTHER_UUID, version: [1, 0, 0] }];
    const host = projectHost({ BP: manifest, RP: fullManifest(OTHER_UUID, 'resources') });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    expect(diagnostics.some((d) => d.code === 'BRK013')).toBe(false);
  });

  it('reads the icon and complains when it is not a png', async () => {
    const host = projectHost({ BP: fullManifest(FIXED_UUID) });
    await host.write('BP/pack_icon.png', 'definitely not a png');
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    expect(diagnostics.find((d) => d.code === 'BRK014')?.severity).toBe('error');
    expect(diagnostics.some((d) => d.code === 'BRK012')).toBe(false);
  });

  it('warns when the icon is not square', async () => {
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      ),
      (c) => c.charCodeAt(0),
    );
    // Patch the IHDR height so the icon claims to be 1x2.
    const tall = new Uint8Array(png);
    tall[23] = 2;
    const host = projectHost({ BP: fullManifest(FIXED_UUID) });
    await host.write('BP/pack_icon.png', tall);
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    expect(diagnostics.find((d) => d.code === 'BRK015')).toBeDefined();
  });

  it('produces the same order every run', async () => {
    const manifest = fullManifest(FIXED_UUID);
    (manifest.header as Record<string, unknown>).version = 'nope';
    manifest.format_version = 99;
    const host = projectHost({ BP: manifest, RP: fullManifest(OTHER_UUID, 'resources') });
    const project = await detectProject(host, '.');
    const first = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    const second = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    expect(first.map((d) => `${d.code}@${d.path}`)).toEqual(
      second.map((d) => `${d.code}@${d.path}`),
    );
  });

  it('ignores junk directories when searching', async () => {
    const host = projectHost({ 'node_modules/pkg': fullManifest(FIXED_UUID) });
    const project = await detectProject(host, '.');
    expect(project.packs.length).toBe(0);
  });
});

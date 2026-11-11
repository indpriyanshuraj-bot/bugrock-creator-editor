// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  applyFixes,
  applyOp,
  detectProject,
  diagnoseProject,
  isUuid,
  isFixable,
  parsePointer,
  readJson,
} from '../src/index';
import { FIXED_UUID, fullManifest, projectHost, uuidSeq } from './helpers';

describe('fix', () => {
  it('parses JSON pointers', () => {
    expect(parsePointer('/header/uuid')).toEqual(['header', 'uuid']);
    expect(parsePointer('/modules/0/uuid')).toEqual(['modules', '0', 'uuid']);
    expect(parsePointer('/a~1b')).toEqual(['a/b']);
    expect(() => parsePointer('header')).toThrow();
  });

  it('sets nested values and creates missing objects', () => {
    const doc: Record<string, unknown> = {};
    applyOp(doc, { kind: 'set', pointer: '/header/name', value: 'x' });
    expect(doc).toEqual({ header: { name: 'x' } });
    applyOp(doc, { kind: 'delete', pointer: '/header/name' });
    expect(doc).toEqual({ header: {} });
  });

  it('writes a generated uuid back to the manifest', async () => {
    const manifest = fullManifest(FIXED_UUID);
    (manifest.header as Record<string, unknown>).uuid = undefined;
    const host = projectHost({ BP: manifest });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });

    const result = await applyFixes(host, diagnostics);
    expect(result.files).toEqual(['BP/manifest.json']);

    const updated = await readJson<{ header: { uuid: string } }>(host, 'BP/manifest.json');
    expect(isUuid(updated.header.uuid)).toBe(true);
  });

  it('fixes a JSONC manifest instead of refusing it', async () => {
    const source = `{
      // the uuid below is invalid, which is the point of this fixture
      "format_version": 2,
      "header": { "name": "jsonc", "uuid": "nope", "version": [1, 0, 0] },
      "modules": [{ "type": "data", "uuid": "11111111-2222-4333-8444-555555555555" }],
    }`;
    const host = projectHost({ BP: source });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });

    const result = await applyFixes(host, diagnostics);
    expect(result.applied).toBeGreaterThan(0);

    const updated = await readJson<{ header: { uuid: string } }>(host, 'BP/manifest.json');
    expect(isUuid(updated.header.uuid)).toBe(true);

    const again = await diagnoseProject(host, await detectProject(host, '.'), {
      newUuid: uuidSeq(7),
    });
    expect(again.filter(isFixable)).toEqual([]);
  });

  it('is idempotent: fix once, nothing fixable remains', async () => {
    const manifest = fullManifest(FIXED_UUID);
    (manifest.header as Record<string, unknown>).uuid = undefined;
    (manifest.modules as Record<string, unknown>[])[0]!.uuid = 'not-a-uuid';

    const host = projectHost({ BP: manifest });
    const project = await detectProject(host, '.');

    const first = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    expect(first.filter(isFixable).length).toBeGreaterThan(0);
    await applyFixes(host, first);

    const projectAgain = await detectProject(host, '.');
    const second = await diagnoseProject(host, projectAgain, { newUuid: uuidSeq(9) });
    expect(second.filter(isFixable)).toEqual([]);
  });
});

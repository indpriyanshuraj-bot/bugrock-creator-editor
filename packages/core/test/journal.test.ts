// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  applyFixes,
  detectProject,
  diagnoseProject,
  JOURNAL_DIR,
  listJournals,
  readText,
  undoJournal,
  type Host,
} from '../src/index';
import { FIXED_UUID, fullManifest, projectHost, uuidSeq } from './helpers';

async function brokenHost(): Promise<{ host: Host; fix: (opts?: object) => Promise<unknown> }> {
  const manifest = fullManifest(FIXED_UUID);
  (manifest.header as Record<string, unknown>).uuid = undefined;
  (manifest.header as Record<string, unknown>).version = 'nope';
  const host = projectHost({ BP: manifest });
  return { host, fix: () => Promise.resolve() };
}

describe('journal', () => {
  it('records a journal when fixes are applied', async () => {
    const { host } = await brokenHost();
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    const result = await applyFixes(host, diagnostics);

    expect(result.journalId).toBeDefined();
    const journals = await listJournals(host);
    expect(journals.length).toBe(1);
    expect(journals[0]?.id).toBe(result.journalId);
    expect(journals[0]?.files).toBe(1);
  });

  it('undo restores the exact original bytes', async () => {
    const manifest = fullManifest(FIXED_UUID);
    (manifest.header as Record<string, unknown>).uuid = undefined;
    const original = JSON.stringify(manifest, null, 2);
    const host = projectHost({ BP: original });

    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    await applyFixes(host, diagnostics);
    expect(await readText(host, 'BP/manifest.json')).not.toBe(`${original}\n`);

    const undone = await undoJournal(host);
    expect(undone?.restored).toEqual(['BP/manifest.json']);
    // Byte-exact: undo restores what was on disk, not a normalised rewrite of it.
    expect(await readText(host, 'BP/manifest.json')).toBe(original);
  });

  it('returns null when there is nothing to undo', async () => {
    const host = projectHost({ BP: fullManifest(FIXED_UUID) });
    expect(await undoJournal(host)).toBeNull();
    expect(await listJournals(host)).toEqual([]);
  });

  it('lists journals newest first', async () => {
    const manifest = fullManifest(FIXED_UUID);
    (manifest.header as Record<string, unknown>).uuid = undefined;
    const host = projectHost({ BP: manifest });

    const broken = `${JSON.stringify(manifest, null, 2)}\n`;

    const first = await detectProject(host, '.');
    const firstDiagnostics = await diagnoseProject(host, first, { newUuid: uuidSeq(1) });
    await applyFixes(host, firstDiagnostics, { now: () => new Date('2026-01-01T00:00:00Z') });

    // Break it again through the host: the fix rewrote the file, so a local mutation is a no-op.
    await host.write('BP/manifest.json', broken);
    const second = await detectProject(host, '.');
    const secondDiagnostics = await diagnoseProject(host, second, { newUuid: uuidSeq(2) });
    await applyFixes(host, secondDiagnostics, { now: () => new Date('2026-01-02T00:00:00Z') });

    const journals = await listJournals(host);
    expect(journals.length).toBe(2);
    expect(journals[0]?.createdAt).toBe('2026-01-02T00:00:00.000Z');
    expect(journals[1]?.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not journal a dry run', async () => {
    const manifest = fullManifest(FIXED_UUID);
    (manifest.header as Record<string, unknown>).uuid = undefined;
    const host = projectHost({ BP: manifest });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });

    const result = await applyFixes(host, diagnostics, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.journalId).toBeUndefined();
    expect(await listJournals(host)).toEqual([]);
    expect(result.diffs.length).toBe(1);
    expect(result.diffs[0]?.added).toBeGreaterThan(0);
  });

  it('can skip the journal on request', async () => {
    const manifest = fullManifest(FIXED_UUID);
    (manifest.header as Record<string, unknown>).uuid = undefined;
    const host = projectHost({ BP: manifest });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    const result = await applyFixes(host, diagnostics, { journal: false });
    expect(result.journalId).toBeUndefined();
    expect(await listJournals(host)).toEqual([]);
  });

  it('keeps the journal out of pack discovery and packing', async () => {
    const manifest = fullManifest(FIXED_UUID);
    (manifest.header as Record<string, unknown>).uuid = undefined;
    const host = projectHost({ BP: manifest });
    const project = await detectProject(host, '.');
    const diagnostics = await diagnoseProject(host, project, { newUuid: uuidSeq() });
    await applyFixes(host, diagnostics);

    expect(await host.exists(JOURNAL_DIR)).toBe(true);
    const again = await detectProject(host, '.');
    expect(again.packs.length).toBe(1);
  });
});

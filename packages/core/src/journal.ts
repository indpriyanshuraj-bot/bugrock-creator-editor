// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import { readText, type Host } from './host';
import { joinPath, type VPath } from './path';

export const JOURNAL_DIR = '.bugrock/journal';

export interface JournalEntry {
  readonly path: VPath;
  /** False when the fix created the file, so undo must remove it. */
  readonly existedBefore: boolean;
  readonly before: string;
  readonly after: string;
}

export interface Journal {
  readonly id: string;
  readonly createdAt: string;
  readonly summary: string;
  readonly entries: readonly JournalEntry[];
}

export interface JournalSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly summary: string;
  readonly files: number;
}

export interface UndoResult {
  readonly id: string;
  readonly restored: readonly VPath[];
  readonly removed: readonly VPath[];
}

export interface WriteJournalOptions {
  readonly now?: () => Date;
  readonly summary?: string;
}

function compactId(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function parseJournal(text: string): Journal | null {
  try {
    const value = JSON.parse(text) as Partial<Journal>;
    if (typeof value.id !== 'string' || !Array.isArray(value.entries)) return null;
    return {
      id: value.id,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
      summary: typeof value.summary === 'string' ? value.summary : '',
      entries: value.entries as JournalEntry[],
    };
  } catch {
    return null;
  }
}

/** Persist before/after text so an apply can be undone, even after the process dies. */
export async function writeJournal(
  host: Host,
  entries: readonly JournalEntry[],
  options: WriteJournalOptions = {},
): Promise<Journal> {
  const now = options.now ?? (() => new Date());
  const createdAt = now().toISOString();
  const base = compactId(now());
  let id = base;
  let attempt = 2;
  while (await host.exists(joinPath(JOURNAL_DIR, `${id}.json`))) {
    id = `${base}-${attempt}`;
    attempt += 1;
  }

  const journal: Journal = {
    id,
    createdAt,
    summary: options.summary ?? `${entries.length} file(s)`,
    entries,
  };
  await host.write(joinPath(JOURNAL_DIR, `${id}.json`), `${JSON.stringify(journal, null, 2)}\n`);
  return journal;
}

export async function readJournal(host: Host, id: string): Promise<Journal | null> {
  const path = joinPath(JOURNAL_DIR, `${id}.json`);
  if (!(await host.exists(path))) return null;
  return parseJournal(await readText(host, path));
}

/** Newest first, because "undo the last thing" is the only undo people mean. */
export async function listJournals(host: Host): Promise<JournalSummary[]> {
  if (!(await host.exists(JOURNAL_DIR))) return [];
  const summaries: JournalSummary[] = [];
  for (const entry of await host.list(JOURNAL_DIR)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
    const journal = parseJournal(await readText(host, entry.path));
    if (!journal) continue;
    summaries.push({
      id: journal.id,
      createdAt: journal.createdAt,
      summary: journal.summary,
      files: journal.entries.length,
    });
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Revert a journal's entries. With no id, the newest journal is used.
 * A file that did not exist before the fix is removed, which needs `host.remove`.
 */
export async function undoJournal(host: Host, id?: string): Promise<UndoResult | null> {
  let target = id;
  if (target === undefined) {
    const [latest] = await listJournals(host);
    if (!latest) return null;
    target = latest.id;
  }

  const journal = await readJournal(host, target);
  if (!journal) return null;

  const restored: VPath[] = [];
  const removed: VPath[] = [];

  for (const entry of journal.entries) {
    if (entry.existedBefore) {
      await host.write(entry.path, entry.before);
      restored.push(entry.path);
      continue;
    }
    if (!host.remove) {
      throw new Error(
        `cannot undo ${entry.path}: this host cannot delete files, and the fix created it`,
      );
    }
    await host.remove(entry.path);
    removed.push(entry.path);
  }

  return { id: journal.id, restored, removed };
}

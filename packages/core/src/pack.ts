// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import { zipSync } from 'fflate';
import type { Host } from './host';
import { basename, isJunk, joinPath, type VPath } from './path';
import type { Pack, Project } from './project';

export interface PackOptions {
  /** Override the folder name used inside the archive. */
  readonly folderName?: (pack: Pack, index: number) => string;
  /** 0-9, defaults to 6. */
  readonly level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

function defaultFolderName(pack: Pack, index: number): string {
  switch (pack.kind) {
    case 'behavior':
      return 'BP';
    case 'resource':
      return 'RP';
    case 'skin':
      return 'SP';
    case 'world_template':
      return 'WT';
    default:
      return basename(pack.root) || `pack${index}`;
  }
}

async function collect(
  host: Host,
  dir: VPath,
  prefix: string,
  out: Record<string, Uint8Array>,
): Promise<void> {
  for (const entry of await host.list(dir)) {
    if (isJunk(entry.name)) continue;
    if (entry.kind === 'dir') {
      await collect(host, entry.path, `${prefix}/${entry.name}`, out);
    } else {
      out[`${prefix}/${entry.name}`] = await host.read(entry.path);
    }
  }
}

/**
 * Build a `.mcaddon` archive. Entries are sorted and compression is fixed, so the same project
 * always produces the same bytes and a hash is a meaningful check.
 */
export async function packProject(
  host: Host,
  project: Project,
  options: PackOptions = {},
): Promise<Uint8Array> {
  const folderName = options.folderName ?? defaultFolderName;
  const files: Record<string, Uint8Array> = {};

  for (const [index, pack] of project.packs.entries()) {
    await collect(host, pack.root, folderName(pack, index), files);
  }

  const sorted: Record<string, Uint8Array> = {};
  for (const key of Object.keys(files).sort((a, b) => a.localeCompare(b))) {
    const value = files[key];
    if (value) sorted[key] = value;
  }

  return zipSync(sorted, { level: options.level ?? 6 });
}

/** Convenience for callers that just want to know how many files a pack would contain. */
export async function countPackFiles(host: Host, project: Project): Promise<number> {
  let count = 0;
  for (const pack of project.packs) {
    const walk = async (dir: VPath): Promise<void> => {
      for (const entry of await host.list(dir)) {
        if (isJunk(entry.name)) continue;
        if (entry.kind === 'dir') await walk(entry.path);
        else count += 1;
      }
    };
    await walk(pack.root);
  }
  return count;
}

export function packFileName(project: Project): string {
  const first = project.packs[0];
  const base = first ? basename(first.root) : basename(project.root);
  const cleaned = (base || 'addon').replace(/[^a-z0-9._-]+/gi, '-');
  return `${cleaned}.mcaddon`;
}

export { joinPath };

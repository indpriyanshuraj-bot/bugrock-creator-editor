// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import { type DirEntry, readText, type Host } from './host';
import { isJunk, joinPath, normalizePath, type VPath } from './path';
import { MANIFEST_FILE, packKindOf, parseManifest, type Manifest, type PackKind } from './manifest';

export interface Pack {
  /** Directory containing the manifest. */
  readonly root: VPath;
  readonly manifestPath: VPath;
  readonly kind: PackKind;
  readonly manifest: Manifest;
  /** Set when the manifest exists but could not be read or parsed. */
  readonly parseError?: string;
}

export interface Project {
  readonly root: VPath;
  readonly packs: readonly Pack[];
}

export interface DetectOptions {
  /** How deep to look for a manifest below the root. */
  readonly maxDepth?: number;
}

async function readPack(host: Host, root: VPath): Promise<Pack> {
  const manifestPath = joinPath(root, MANIFEST_FILE);
  let text: string;
  try {
    text = await readText(host, manifestPath);
  } catch {
    return {
      root,
      manifestPath,
      kind: 'unknown',
      manifest: {},
      parseError: 'manifest could not be read',
    };
  }
  const parsed = parseManifest(text);
  if (!parsed.ok) {
    return { root, manifestPath, kind: 'unknown', manifest: {}, parseError: parsed.error };
  }
  return { root, manifestPath, kind: packKindOf(parsed.manifest), manifest: parsed.manifest };
}

/**
 * Breadth-first search for `manifest.json`, depth-limited, junk-skipping.
 * A directory that has a manifest is a pack and is not descended into.
 */
export async function detectProject(
  host: Host,
  root: VPath,
  options: DetectOptions = {},
): Promise<Project> {
  const maxDepth = options.maxDepth ?? 4;
  const start = normalizePath(root);
  const packs: Pack[] = [];
  const queue: { path: VPath; depth: number }[] = [{ path: start, depth: 0 }];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;
    let entries: readonly DirEntry[];
    try {
      entries = await host.list(node.path);
    } catch {
      continue;
    }
    if (entries.some((entry) => entry.kind === 'file' && entry.name === MANIFEST_FILE)) {
      packs.push(await readPack(host, node.path));
      continue;
    }
    if (node.depth >= maxDepth) continue;
    for (const entry of entries) {
      if (entry.kind === 'dir' && !isJunk(entry.name)) {
        queue.push({ path: entry.path, depth: node.depth + 1 });
      }
    }
  }

  packs.sort((a, b) => a.root.localeCompare(b.root));
  return { root: start, packs };
}

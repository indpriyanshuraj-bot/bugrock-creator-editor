// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname as nodeDirname, join, resolve, sep } from 'node:path';
import {
  joinPath,
  normalizePath,
  type Capabilities,
  type DirEntry,
  type Host,
  type VPath,
} from '@bugrock/core';

const NODE_CAPS: Capabilities = {
  realFs: true,
  persistent: true,
  longJobs: true,
  wakeLock: false,
  git: true,
  maxJobSeconds: 900,
};

/**
 * Filesystem host for the CLI and TUI. Every path is contained to `base`: a `..` that would
 * escape the project root is an error, not a normalisation.
 */
export class NodeHost implements Host {
  readonly name = 'node';
  readonly caps: Capabilities = NODE_CAPS;
  readonly #base: string;

  constructor(base: string) {
    this.#base = resolve(base);
  }

  #absolute(path: VPath): string {
    const absolute = resolve(this.#base, normalizePath(path));
    if (absolute !== this.#base && !absolute.startsWith(this.#base + sep)) {
      throw new Error(`path escapes the project root: ${path}`);
    }
    return absolute;
  }

  async read(path: VPath): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.#absolute(path)));
  }

  async write(path: VPath, data: Uint8Array | string): Promise<void> {
    const absolute = this.#absolute(path);
    await mkdir(nodeDirname(absolute), { recursive: true });
    await writeFile(absolute, data);
  }

  async exists(path: VPath): Promise<boolean> {
    try {
      await stat(this.#absolute(path));
      return true;
    } catch {
      return false;
    }
  }

  async list(path: VPath): Promise<readonly DirEntry[]> {
    const absolute = this.#absolute(path);
    const entries = await readdir(absolute, { withFileTypes: true });
    return Promise.all(
      entries.map(async (entry): Promise<DirEntry> => {
        const childPath = joinPath(normalizePath(path), entry.name);
        if (entry.isDirectory()) {
          return { name: entry.name, path: childPath, kind: 'dir', size: 0 };
        }
        let size = 0;
        try {
          size = (await stat(join(absolute, entry.name))).size;
        } catch {
          size = 0;
        }
        return { name: entry.name, path: childPath, kind: 'file', size };
      }),
    );
  }
}

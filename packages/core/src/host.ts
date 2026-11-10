// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import { normalizePath, type VPath } from './path';

export interface DirEntry {
  readonly name: string;
  readonly path: VPath;
  readonly kind: 'file' | 'dir';
  readonly size: number;
}

/**
 * What a host can do. Advertised, never sniffed: the UI renders from this object.
 */
export interface Capabilities {
  readonly realFs: boolean;
  readonly persistent: boolean;
  readonly longJobs: boolean;
  readonly wakeLock: boolean;
  readonly git: boolean;
  readonly maxJobSeconds: number;
}

/**
 * The only thing the core knows about the outside world.
 *
 * Implementations: MemoryHost (tests), NodeHost (cli/tui), BrowserHost (v0.6, OPFS),
 * BridgeHost (v0.4, HTTP to a local daemon).
 */
export interface Host {
  readonly name: string;
  readonly caps: Capabilities;
  read(path: VPath): Promise<Uint8Array>;
  write(path: VPath, data: Uint8Array | string): Promise<void>;
  list(path: VPath): Promise<readonly DirEntry[]>;
  exists(path: VPath): Promise<boolean>;
}

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

export function encodeText(text: string): Uint8Array {
  return encoder.encode(text);
}

export function decodeText(data: Uint8Array): string {
  return decoder.decode(data);
}

export async function readText(host: Host, path: VPath): Promise<string> {
  return decodeText(await host.read(path));
}

export async function readJson<T>(host: Host, path: VPath): Promise<T> {
  return JSON.parse(await readText(host, path)) as T;
}

export function memoryCaps(overrides: Partial<Capabilities> = {}): Capabilities {
  return {
    realFs: false,
    persistent: false,
    longJobs: false,
    wakeLock: false,
    git: false,
    maxJobSeconds: 60,
    ...overrides,
  };
}

/** In-memory host. The reason the core is testable without touching a disk. */
export class MemoryHost implements Host {
  readonly name = 'memory';
  readonly caps: Capabilities;

  readonly #files = new Map<VPath, Uint8Array>();

  constructor(seed: Record<string, string | Uint8Array> = {}, caps: Partial<Capabilities> = {}) {
    this.caps = memoryCaps(caps);
    for (const [path, value] of Object.entries(seed)) {
      this.#files.set(normalizePath(path), typeof value === 'string' ? encodeText(value) : value);
    }
  }

  async read(path: VPath): Promise<Uint8Array> {
    const data = this.#files.get(normalizePath(path));
    if (!data) throw new Error(`ENOENT: ${path}`);
    return data;
  }

  async write(path: VPath, data: Uint8Array | string): Promise<void> {
    this.#files.set(normalizePath(path), typeof data === 'string' ? encodeText(data) : data);
  }

  async exists(path: VPath): Promise<boolean> {
    const normalized = normalizePath(path);
    if (this.#files.has(normalized)) return true;
    const prefix = normalized === '.' ? '' : `${normalized}/`;
    for (const key of this.#files.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  async list(path: VPath): Promise<readonly DirEntry[]> {
    const dir = normalizePath(path);
    const prefix = dir === '.' ? '' : `${dir}/`;
    const seen = new Map<string, DirEntry>();
    for (const [key, value] of this.#files) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest.length === 0) continue;
      const slash = rest.indexOf('/');
      if (slash === -1) {
        seen.set(rest, { name: rest, path: key, kind: 'file', size: value.byteLength });
      } else {
        const name = rest.slice(0, slash);
        const childPath = `${prefix}${name}`;
        if (!seen.has(name)) seen.set(name, { name, path: childPath, kind: 'dir', size: 0 });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Test helper: every file currently held. */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of [...this.#files].sort(([a], [b]) => a.localeCompare(b))) {
      out[key] = decodeText(value);
    }
    return out;
  }
}

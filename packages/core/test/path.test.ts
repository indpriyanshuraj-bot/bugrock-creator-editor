// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  basename,
  dirname,
  extname,
  isJunk,
  isWithin,
  joinPath,
  normalizePath,
} from '../src/index';

describe('path', () => {
  it('normalizes separators and dots', () => {
    expect(normalizePath('a\\b/./c')).toBe('a/b/c');
    expect(normalizePath('a/b/../c')).toBe('a/c');
    expect(normalizePath('./a')).toBe('a');
    expect(normalizePath('')).toBe('.');
  });

  it('refuses to escape the root', () => {
    expect(normalizePath('../../etc/passwd')).toBe('etc/passwd');
    expect(isWithin('project', 'project/a/b')).toBe(true);
    expect(isWithin('project', 'projectile/a')).toBe(false);
    expect(isWithin('.', 'anything')).toBe(true);
  });

  it('joins, splits and reads extensions', () => {
    expect(joinPath('packs', 'BP')).toBe('packs/BP');
    expect(joinPath('a', '', 'b')).toBe('a/b');
    expect(dirname('a/b/c.json')).toBe('a/b');
    expect(dirname('a')).toBe('.');
    expect(basename('a/b/c.json')).toBe('c.json');
    expect(extname('a/b/c.JSON')).toBe('.json');
    expect(extname('a/b/.hidden')).toBe('');
  });

  it('knows junk', () => {
    expect(isJunk('.git')).toBe(true);
    expect(isJunk('node_modules')).toBe(true);
    expect(isJunk('.tmp-abc')).toBe(true);
    expect(isJunk('textures')).toBe(false);
  });
});

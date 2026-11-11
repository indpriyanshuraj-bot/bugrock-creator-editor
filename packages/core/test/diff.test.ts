// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { diffFile, diffText, formatFileDiff } from '../src/index';

describe('diff', () => {
  it('reports no change for identical text', () => {
    const result = diffText('a\nb\n', 'a\nb\n');
    expect(result.hunks).toEqual([]);
    expect(diffFile('x.json', 'a\n', 'a\n').identical).toBe(true);
  });

  it('counts a changed line as one removal and one addition', () => {
    const result = diffText('{\n  "a": 1\n}\n', '{\n  "a": 2\n}\n');
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.hunks.length).toBe(1);
    const kinds = result.hunks[0]?.lines.map((line) => line.kind);
    expect(kinds).toContain('remove');
    expect(kinds).toContain('add');
  });

  it('handles pure insertions and pure deletions', () => {
    expect(diffText('a\nc\n', 'a\nb\nc\n').added).toBe(1);
    expect(diffText('a\nc\n', 'a\nb\nc\n').removed).toBe(0);
    expect(diffText('a\nb\nc\n', 'a\nc\n').removed).toBe(1);
    expect(diffText('a\nb\nc\n', 'a\nc\n').added).toBe(0);
  });

  it('keeps distant changes in separate hunks', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 1', 'line one').replace('line 18', 'line eighteen');
    const result = diffText(`${before}\n`, `${after}\n`, 2);
    expect(result.hunks.length).toBe(2);
  });

  it('merges nearby changes into one hunk', () => {
    const before = ['a', 'b', 'c', 'd', 'e'].join('\n');
    const after = ['a', 'B', 'c', 'D', 'e'].join('\n');
    expect(diffText(`${before}\n`, `${after}\n`, 3).hunks.length).toBe(1);
  });

  it('formats a unified-style diff', () => {
    const diff = diffFile('BP/manifest.json', '{\n  "a": 1\n}\n', '{\n  "a": 2\n}\n');
    const text = formatFileDiff(diff);
    expect(text).toContain('--- a/BP/manifest.json');
    expect(text).toContain('+++ b/BP/manifest.json');
    expect(text).toContain('@@');
    expect(text).toContain('-  "a": 1');
    expect(text).toContain('+  "a": 2');
  });

  it('says so when there is nothing to show', () => {
    expect(formatFileDiff(diffFile('x.json', 'same\n', 'same\n'))).toBe('x.json: no change');
  });

  it('handles empty inputs', () => {
    expect(diffText('', 'a\n').added).toBe(1);
    expect(diffText('a\n', '').removed).toBe(1);
    expect(diffText('', '').hunks).toEqual([]);
  });
});

// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { parseJsonc } from '../src/index';

describe('jsonc', () => {
  it('parses plain JSON', () => {
    const result = parseJsonc('{"a":1,"b":[true,false,null,"x"]}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1, b: [true, false, null, 'x'] });
  });

  it('accepts line comments, block comments and trailing commas', () => {
    const source = `{
      // the schema version
      "format_version": 2,
      /* modules are required */
      "modules": [
        { "type": "data", "uuid": "x", },
      ],
    }`;
    const result = parseJsonc(source);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ format_version: 2, modules: [{ type: 'data', uuid: 'x' }] });
    }
  });

  it('reports whether comments were present', () => {
    const plain = parseJsonc('{"a":1}');
    expect(plain.ok && plain.hasComments).toBe(false);
    const line = parseJsonc('{\n // hi\n "a":1}');
    expect(line.ok && line.hasComments).toBe(true);
    const block = parseJsonc('{/* hi */"a":1}');
    expect(block.ok && block.hasComments).toBe(true);
  });

  it('records positions by JSON pointer', () => {
    const source = '{\n  "header": {\n    "uuid": "abc"\n  }\n}';
    const result = parseJsonc(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const uuid = result.positions.get('/header/uuid');
    expect(uuid).toBeDefined();
    expect(uuid?.line).toBe(3);
    expect(uuid?.column).toBe(13);
    expect(uuid?.length).toBe(5);
    expect(result.positions.get('/header')?.line).toBe(2);
  });

  it('records array element positions', () => {
    const source = '{\n  "modules": [\n    { "type": "data" },\n    { "type": "script" }\n  ]\n}';
    const result = parseJsonc(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.positions.get('/modules/0')?.line).toBe(3);
    expect(result.positions.get('/modules/1')?.line).toBe(4);
    expect(result.positions.get('/modules/1/type')?.line).toBe(4);
  });

  it('decodes escapes', () => {
    const result = parseJsonc('{"s":"a\\"b\\\\c\\n\\u00e9"}');
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value as Record<string, string>).s).toBe('a"b\\c\né');
  });

  it('parses numbers including exponents and negatives', () => {
    const result = parseJsonc('[-1, 0, 1.5, 2e3, -1.2E-2]');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([-1, 0, 1.5, 2000, -0.012]);
  });

  it('reports a syntax error with a line and column', () => {
    const result = parseJsonc('{\n  "a": 1,\n  "b" 2\n}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.line).toBe(3);
    expect(result.issue.message).toMatch(/expected/);
  });

  it('reports an unterminated string', () => {
    const result = parseJsonc('{"a": "oops}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.message).toMatch(/unterminated string/);
  });

  it('reports an unterminated block comment', () => {
    const result = parseJsonc('{"a":1} /* oops');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.message).toMatch(/block comment/);
  });

  it('rejects trailing content', () => {
    const result = parseJsonc('{"a":1} {"b":2}');
    expect(result.ok).toBe(false);
  });

  it('skips a byte order mark', () => {
    const result = parseJsonc('\ufeff{"a":1}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it('escapes pointers for keys containing slashes and tildes', () => {
    const result = parseJsonc('{"a/b": {"c~d": 1}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.positions.has('/a~1b/c~0d')).toBe(true);
  });
});

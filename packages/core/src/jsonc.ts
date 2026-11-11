// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

/**
 * A JSONC parser that keeps source positions.
 *
 * Why not `JSON.parse`: a diagnostic without a line number is a scavenger hunt on a phone, and
 * real add-ons are full of comments and trailing commas. Why not a dependency: the position map
 * keyed by JSON Pointer is the thing we actually need, and it is 300 lines.
 */

export interface SourcePosition {
  /** 1-based. */
  readonly line: number;
  /** 1-based, in UTF-16 code units. */
  readonly column: number;
  /** 0-based offset into the source text. */
  readonly offset: number;
  readonly length: number;
}

export interface JsoncIssue {
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export type JsoncParseResult =
  | {
      readonly ok: true;
      readonly value: unknown;
      /** JSON Pointer -> where that value starts in the source. */
      readonly positions: ReadonlyMap<string, SourcePosition>;
      /** True when the source had comments, which a JSON rewrite would drop. */
      readonly hasComments: boolean;
    }
  | { readonly ok: false; readonly issue: JsoncIssue };

export function escapePointer(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

class JsoncParseError extends Error {
  constructor(readonly issue: JsoncIssue) {
    super(issue.message);
    this.name = 'JsoncParseError';
  }
}

export function parseJsonc(source: string): JsoncParseResult {
  const positions = new Map<string, SourcePosition>();
  const text = source;
  const length = text.length;
  let index = 0;
  let line = 1;
  let lineStart = 0;
  let hasComments = false;

  // Skip a byte-order mark without shifting every offset by one.
  if (length > 0 && text.charCodeAt(0) === 0xfeff) {
    index = 1;
    lineStart = 1;
  }

  const fail = (message: string): never => {
    throw new JsoncParseError({ message, offset: index, line, column: index - lineStart + 1 });
  };

  const advance = (count = 1): void => {
    for (let step = 0; step < count; step += 1) {
      if (text.charCodeAt(index) === 10) {
        line += 1;
        lineStart = index + 1;
      }
      index += 1;
    }
  };

  const skipTrivia = (): void => {
    for (;;) {
      const ch = text[index];
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        advance();
        continue;
      }
      if (ch === '/' && text[index + 1] === '/') {
        hasComments = true;
        while (index < length && text.charCodeAt(index) !== 10) advance();
        continue;
      }
      if (ch === '/' && text[index + 1] === '*') {
        hasComments = true;
        advance(2);
        for (;;) {
          if (index >= length) fail('unterminated block comment');
          if (text[index] === '*' && text[index + 1] === '/') {
            advance(2);
            break;
          }
          advance();
        }
        continue;
      }
      return;
    }
  };

  const parseString = (): string => {
    if (text[index] !== '"') fail('expected a string');
    advance();
    let out = '';
    for (;;) {
      if (index >= length) fail('unterminated string');
      const ch = text[index];
      if (ch === '"') {
        advance();
        return out;
      }
      if (ch === '\\') {
        advance();
        const escape = text[index];
        if (escape === undefined) return fail('unterminated escape sequence');
        if (escape === 'u') {
          const hex = text.slice(index + 1, index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('invalid \\u escape');
          out += String.fromCharCode(Number.parseInt(hex, 16));
          advance(5);
          continue;
        }
        const simple: Record<string, string> = {
          '"': '"',
          '\\': '\\',
          '/': '/',
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
        };
        const decoded = simple[escape];
        if (decoded === undefined) fail(`invalid escape \\${escape}`);
        out += decoded;
        advance();
        continue;
      }
      if ((ch ?? '').charCodeAt(0) < 0x20) fail('control character in string');
      out += ch;
      advance();
    }
  };

  const parseNumber = (): number => {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (!match || match[0].length === 0) return fail('expected a number');
    advance(match[0].length);
    return Number(match[0]);
  };

  const parseArray = (pointer: string): unknown[] => {
    advance(); // [
    const out: unknown[] = [];
    skipTrivia();
    if (text[index] === ']') {
      advance();
      return out;
    }
    for (;;) {
      out.push(parseValue(`${pointer}/${out.length}`));
      skipTrivia();
      const ch = text[index];
      if (ch === ',') {
        advance();
        skipTrivia();
        if (text[index] === ']') {
          advance();
          return out;
        }
        continue;
      }
      if (ch === ']') {
        advance();
        return out;
      }
      fail("expected ',' or ']'");
    }
  };

  const parseObject = (pointer: string): Record<string, unknown> => {
    advance(); // {
    const out: Record<string, unknown> = {};
    skipTrivia();
    if (text[index] === '}') {
      advance();
      return out;
    }
    for (;;) {
      skipTrivia();
      const key = parseString();
      skipTrivia();
      if (text[index] !== ':') fail("expected ':'");
      advance();
      out[key] = parseValue(`${pointer}/${escapePointer(key)}`);
      skipTrivia();
      const ch = text[index];
      if (ch === ',') {
        advance();
        skipTrivia();
        if (text[index] === '}') {
          advance();
          return out;
        }
        continue;
      }
      if (ch === '}') {
        advance();
        return out;
      }
      fail("expected ',' or '}'");
    }
  };

  const parseValue = (pointer: string): unknown => {
    skipTrivia();
    const startOffset = index;
    const startLine = line;
    const startColumn = index - lineStart + 1;
    const ch = text[index];
    let value: unknown;

    switch (ch) {
      case '{':
        value = parseObject(pointer);
        break;
      case '[':
        value = parseArray(pointer);
        break;
      case '"':
        value = parseString();
        break;
      case 't':
        if (text.slice(index, index + 4) !== 'true') return fail('expected true');
        advance(4);
        value = true;
        break;
      case 'f':
        if (text.slice(index, index + 5) !== 'false') return fail('expected false');
        advance(5);
        value = false;
        break;
      case 'n':
        if (text.slice(index, index + 4) !== 'null') return fail('expected null');
        advance(4);
        value = null;
        break;
      default:
        value = parseNumber();
    }

    positions.set(pointer, {
      line: startLine,
      column: startColumn,
      offset: startOffset,
      length: index - startOffset,
    });
    return value;
  };

  try {
    skipTrivia();
    const value = parseValue('');
    skipTrivia();
    if (index < length) fail('unexpected content after the document');
    return { ok: true, value, positions, hasComments };
  } catch (error) {
    if (error instanceof JsoncParseError) return { ok: false, issue: error.issue };
    throw error;
  }
}

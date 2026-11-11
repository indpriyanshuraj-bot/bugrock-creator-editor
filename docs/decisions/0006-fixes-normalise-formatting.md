# 0006 — Fixes normalise formatting, and say so

**Status:** accepted · 2026-11-11

## Decision

A fix rewrites the whole manifest with `JSON.stringify(doc, null, 2)`. It does not edit the text in
place. Because that changes formatting (and drops JSONC comments), `fix` warns by name about every
file whose comments it is about to drop, and `--diff` shows the result before anything is written.

## Why

We have source positions, so surgical text edits are possible — and they are the wrong first move.
Deleting an array element means also fixing the comma and whitespace around it; a splice that is
one character off produces a manifest that no longer parses, on someone's phone, with no undo in
their head. Re-serialising cannot corrupt: the output is valid JSON by construction, and the
idempotency property test proves that a second run changes nothing.

The cost is real and visible: a one-line UUID fix reports ~20 changed lines because `[1, 0, 0]`
becomes a three-line array. So the tool states the cost rather than hiding it — the CLI prints a
`note:` naming files whose comments will be dropped, `--diff` prints the exact hunks, and every
apply writes a journal that `undo` restores byte-for-byte.

## Consequences

- `fix` on a commented manifest is a formatting change the user has agreed to, not a surprise.
- Anything that wants minimal edits should build on `applyPatch` (v0.5.0) rather than weakening
  this path.
- The journal is the safety net, not a nicety: it is what makes a destructive-looking rewrite
  reversible on a device where nothing else is.

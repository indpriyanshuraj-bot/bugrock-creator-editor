# 0005 — Upstream is a subprocess, not an import

**Status:** accepted · 2026-11-11

## Decision

`@minecraft/creator-tools` (177MB unpacked, `bin: mct`, no `exports` map) is invoked as a
subprocess from `NodeHost` when we need its heavyweight validation. It is never imported into the
core, and never bundled.

## Why

- No `exports` map means any deep import is an unsupported reach into internals that will break.
- A 177MB dependency with optional `playwright` and `@resvg/resvg-js` has no business in a phone
  install path.
- A process boundary is also a licence boundary: it stays MIT, unmodified, and clearly separate.

## Consequences

- Core diagnostics must stand on their own; `mct` is an optional second opinion, not a crutch.
- If we ever need one of its algorithms, we reimplement it from behaviour with attribution — never
  copy the file.

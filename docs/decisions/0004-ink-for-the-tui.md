# 0004 — Ink for the TUI

**Status:** accepted · 2026-11-11

## Decision

The TUI is Ink 8 + React 19.

## Why

Ink gives layout (flexbox via yoga) and diffed rendering for free, which is most of the work in a
terminal UI. It is pure JavaScript plus a WASM layout engine, so it runs in Termux without a
toolchain. It is also the same mental model as the future web UI, which keeps the codebase
legible.

## Rejected

- `neo-blessed` — unmaintained, imperative, and its rendering model fights React-style state.
- `@opentui/core` — attractive and fast, but Zig native bindings are a Termux risk we do not need
  yet. Revisit at v0.2.0 if Ink's rendering becomes the bottleneck.

## Consequences

- The TUI depends on React 19 while the web app will use Preact. That is acceptable: they are
  separate packages and never share a bundle.

# 0002 — The core is pure and host-abstracted

**Status:** accepted · 2026-11-11

## Decision

`packages/core` performs no I/O. It receives a `Host` (read/write/list/exists + capabilities) and
returns values. No `node:*`, no DOM globals, no sibling-package imports.

## Why

The web app, the TUI, the CLI and the MCP server must agree about what a valid manifest is. The
only way to guarantee that is to have one implementation, tested once, running everywhere. The
alternative — a Node engine and a browser engine — is how projects end up with two subtly different
validators and a bug report nobody can reproduce.

## Consequences

- `scripts/check-core-boundary.mjs` fails CI on any violation. It is a 60-line script rather than
  an ESLint plugin, deliberately: zero dependency risk, and the rule is the only one we need.
- Core operations are trivially testable with `MemoryHost`.
- Performance work happens in hosts, not in the core.

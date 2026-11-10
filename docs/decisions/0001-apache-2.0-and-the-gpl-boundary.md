# 0001 — Apache-2.0, and the GPL boundary

**Status:** accepted · 2026-11-11

## Decision

Our code is Apache-2.0. We never link code from `bridge-core/editor` (GPL-3.0). We may depend on
that organisation's MIT-licensed libraries (`dash-compiler`, `molang`, `mc-project-core`) and on
`Mojang/minecraft-creator-tools` (MIT).

## Why

The patent grant (§3) plus the termination clause is worth the ceremony for a project that
reimplements compiler and validator behaviour. The cost is the boundary: Apache-2.0 code can be
absorbed into a GPL-3.0 work, but not the reverse — linking GPL-3.0 code into an Apache-2.0 work
forces the whole distribution to GPL-3.0. So the rule is absolute, and reviewers enforce it.

## Consequences

- `NOTICE` must be propagated by redistributors.
- Every source file carries an SPDX header.
- Any vendored upstream module carries an origin + commit SHA + "what we changed" header (§5).
- CI and the PR template both check for transcription from the GPL project.

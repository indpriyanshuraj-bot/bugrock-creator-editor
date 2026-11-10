# 0003 — rolldown (via tsdown) for bundling

**Status:** accepted · 2026-11-11

## Decision

Library and CLI builds use `tsdown`, which is rolldown under the hood. The native binding
(`@rolldown/binding-<platform>`) is a build-time-only dependency.

## Why

- rolldown publishes `android-arm64` bindings, so a build works in Termux — that is a hard
  requirement, and it rules out bundlers that only ship desktop binaries.
- The native binary is ~10x faster than the WASM fallback, and it is only needed on the machine
  doing the build. Nothing in the shipped artifact depends on it.
- `tsdown` gives ESM + `.d.ts` from one config, which is all a library of this size needs.

## Consequences

- `pnpm install` on a fresh Termux pulls a platform binding. If that ever fails, `rolldown` also
  ships `@rolldown/binding-wasm32-wasi` as a fallback.
- Contributors who only run tests never invoke the bundler.

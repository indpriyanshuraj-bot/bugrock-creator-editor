# Architecture

## One core, four hosts, one protocol

```
                    clients
   ┌──────────┬──────────┬──────────┬────────────┐
   │   TUI    │   CLI    │   MCP    │  web (v0.6)│
   └────┬─────┴────┬─────┴────┬─────┴──────┬─────┘
        └──────────┴────┬─────┴────────────┘
                        │
                 ┌──────▼───────┐
                 │  @bugrock/   │  pure: paths, manifest, project,
                 │     core     │  diagnose, fix, pack
                 └──────┬───────┘
                        │  Host interface
        ┌───────────────┼───────────────┬──────────────┐
   ┌────▼────┐    ┌─────▼─────┐   ┌─────▼─────┐  ┌─────▼──────┐
   │MemoryH. │    │  NodeHost │   │ TermuxHost│  │ BridgeHost │
   └─────────┘    └───────────┘   └───────────┘  └────────────┘
```

The core knows nothing about disks, browsers or terminals. It receives a `Host` and returns data.
That is the whole design, and it is enforced by `pnpm check:boundary`.

## Why the core is pure

Because the alternative is writing the engine twice — once for Node and once for the browser — and
then discovering in month three that the two disagree about UUID handling. Every rule that matters
(what a valid manifest is, what a fix does, how a zip is ordered) lives in one place, is tested
once, and runs unchanged in Chromium.

## Capability descriptor

Hosts advertise what they can do; the UI renders from the descriptor instead of sniffing features.

```json
{
  "host": "termux",
  "caps": {
    "realFs": true,
    "persistent": true,
    "longJobs": true,
    "wakeLock": true,
    "git": true,
    "maxJobSeconds": 900
  }
}
```

## Diagnostics and fixes

A diagnostic is data, not a string:

```ts
{
  code: 'BRK005',
  severity: 'error',
  message: 'manifest header.uuid is not a valid UUID',
  path: 'packs/BP/manifest.json',
  pointer: '/header/uuid',
  fix: { summary: 'Generate a v4 UUID', ops: [{ kind: 'set', pointer: '/header/uuid', value: '…' }] }
}
```

Because the fix travels with the diagnostic, the CLI, the TUI and the future web app all get
auto-fix for free, and "fix everything" is a fold over a list rather than a second engine.

## Why the packer must be deterministic

A build you cannot hash is a build you cannot verify. Sorted entries plus a fixed mtime means the
same project always produces the same bytes, so a CI job can assert it and a user can compare two
phones' output.

## Deliberate non-goals in the core

No network, no filesystem, no logging side effects, no global mutable state. The core returns
values; callers decide what to do with them.

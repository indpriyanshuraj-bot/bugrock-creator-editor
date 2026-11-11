# bugrock-creator-editor

> **Experimental. Vibe-coded. Expect breakage.** This is a work in progress and the API will move
> under your feet until `v1.0.0`. Do not depend on it yet.

A mobile-first toolkit for Minecraft: Bedrock Edition add-ons: inspect, diagnose, auto-fix and pack
behavior/resource packs on a phone, in Termux, or in a terminal on a laptop.

Not affiliated with Mojang Studios or Microsoft. "Minecraft" is a trademark of Mojang Synergies AB
and is used here descriptively only.

**Links:** [status page](https://indpriyanshuraj-bot.github.io/bugrock-creator-editor/) ·
[roadmap board](https://github.com/users/indpriyanshuraj-bot/projects/1) ·
[releases](https://github.com/indpriyanshuraj-bot/bugrock-creator-editor/releases) ·
[roadmap in the repo](docs/ROADMAP.md)

## Status

| Version | Theme                                                     | State       |
| ------- | --------------------------------------------------------- | ----------- |
| v0.0.1  | boots — core seam, diagnostics, packer, CLI, TUI skeleton | in progress |
| v0.0.2  | sees — honest parser, line/column diagnostics             | planned     |
| v0.0.3  | fixes — dry-run diffs, idempotent fixes                   | planned     |
| v0.1.0  | packs — reproducible `.mcpack` / `.mcaddon` export        | planned     |
| v0.2.0  | tui — full keyboard-driven interface                      | planned     |
| v0.3.0  | talks — MCP server (stdio + HTTP)                         | planned     |
| v0.4.0  | serves — local daemon with capability negotiation         | planned     |
| v0.6.0  | web — PWA on GitHub Pages, OPFS storage                   | planned     |

See [docs/ROADMAP.md](docs/ROADMAP.md) for scope and exit criteria per version.

## What it does today (v0.0.3)

- Discovers behavior/resource packs under a folder by finding `manifest.json` files.
- Reads **JSONC**: comments and trailing commas are accepted, because real manifests have them.
- Every positional diagnostic carries a **line and column**, not just a JSON pointer.
- Diagnoses: parse errors, missing/invalid/duplicate UUIDs (pack and module), unsupported
  `format_version`, unrecognised module types, dangling dependencies, and pack icons that are
  missing, not a PNG, not square, or an odd size.
- Fixes the deterministic ones (UUIDs, dangling dependency entries) — **preview first with
  `--diff`**, then apply. Every apply writes a journal, and `bugrock undo` restores the exact
  original bytes.
- **Fixes normalise formatting.** A fix re-serialises the manifest as JSON, so comments are dropped
  and arrays are expanded: a one-line UUID fix can read as a 20-line diff. The CLI warns by name
  before doing it, `--diff` shows it, and `undo` reverts it. See
  [ADR 0006](docs/decisions/0006-fixes-normalise-formatting.md).
- Packs packs into a `.mcaddon` zip.
- CLI: `bugrock inspect | diagnose | fix | pack`.
- TUI: `bugrock-tui <path>`.

It does **not** edit add-on content yet, and it has no web UI. That is deliberate; see the roadmap.

## Quickstart

Desktop / Termux, from a checkout:

```sh
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm build

# then, against the bundled fixture or your own project:
node packages/cli/dist/index.js diagnose ./fixtures/sample
node packages/cli/dist/index.js fix ./fixtures/sample --diff   # look first
node packages/cli/dist/index.js fix ./fixtures/sample          # then apply
node packages/cli/dist/index.js undo ./fixtures/sample         # change your mind
node packages/tui/dist/index.js ./fixtures/sample
```

Termux notes: use `pkg install nodejs-lts git`, and run `termux-wake-lock` before long jobs.
See [docs/TERMUX.md](docs/TERMUX.md).

## Built on

This project stands on other people's work. Attribution is in [NOTICE](NOTICE) and
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

| Upstream                                                                            | License               | How we use it                                                                      |
| ----------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| [Mojang/minecraft-creator-tools](https://github.com/Mojang/minecraft-creator-tools) | MIT (assets excluded) | Reference for diagnostics semantics; its CLI is used as a subprocess, never linked |
| [bridge-core/dash-compiler](https://github.com/bridge-core/dash-compiler)           | MIT                   | dependency, later versions                                                         |
| [bridge-core/molang](https://github.com/bridge-core/molang)                         | MIT                   | dependency, later versions                                                         |
| [bridge-core/mc-project-core](https://github.com/bridge-core/mc-project-core)       | MIT                   | reference for project loading                                                      |
| [bridge-core/editor](https://github.com/bridge-core/editor)                         | GPL-3.0               | **read-only reference. No code is copied or linked**                               |

## License

Apache-2.0. See [LICENSE](LICENSE). Contributions require a DCO sign-off; see
[CONTRIBUTING.md](CONTRIBUTING.md).

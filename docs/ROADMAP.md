# Roadmap

Versioned, not dated. A version ships when its exit criteria are met, and not before.

**The rule that orders everything:** every version must be usable on a phone before the next one
starts. Nothing is "infrastructure only" — if you cannot run it in Termux and see a result, it does
not ship.

**Ordering note.** The web app is last on purpose. It is the hardest surface (OPFS, PWA, WASM
budgets, mobile IME) and the one that cannot be tested cheaply. Core, CLI and TUI prove the engine
first, so that when the web app arrives it is a shell over something already trusted.

---

## v0.0.1 — boots

**Goal:** the seam exists and is tested.

- pnpm monorepo, `@bugrock/core` with `Host` + `MemoryHost`, path utilities.
- Manifest parsing, pack discovery by `manifest.json`, pack-kind classification.
- Twelve diagnostics covering parse errors, format version, UUIDs (missing/invalid/duplicate),
  missing modules, dangling dependencies, missing name and pack icon.
- Fix engine: deterministic fixes as JSON-pointer operations, applied in one pass.
- `.mcaddon` packer over `fflate`.
- CLI: `bugrock inspect | diagnose | fix | pack`, `--json` on every command.
- TUI skeleton: open a path, list packs, list diagnostics, apply fixes, pack.
- CI (typecheck, tests, boundary check, build, format), DCO check, Pages deploy of a status page.

**Out of scope:** content editing, web UI, MCP, daemon.

**Exit:** `pnpm test` green; `bugrock diagnose` prints codes on a real pack; TUI opens and shows
diagnostics; core boundary check green.

---

## v0.0.2 — sees

**Goal:** an honest parser. Mobile add-ons are full of JSONC and stale `format_version` values.

- JSONC support (comments, trailing commas) with source positions.
- Diagnostics carry line/column and a JSON pointer, not just a path.
- `format_version` registry per module type, with "this is newer than we know" as a distinct
  warning rather than an error.
- UUID index across every pack in the project, so cross-pack references resolve.
- `pack_icon.png` dimension and format check.
- Deterministic diagnostic ordering, so output is diffable in CI.
- Fixture corpus: at least 30 real-world packs (license-clean), committed as text only.

**Exit:** line/column present on every positional diagnostic; corpus runs in under 5s.

---

## v0.0.3 — fixes

**Goal:** fixes you can trust on someone else's pack.

- `--diff` dry run showing the exact before/after per file.
- Per-fix confirmation in the TUI.
- Idempotency: diagnose → fix → diagnose leaves zero fixable diagnostics.
- Fix journal on disk so an apply can be undone.
- Property-based tests: random manifests in, no crashes, only valid output.

**Exit:** the idempotency property holds across the whole fixture corpus.

---

## v0.1.0 — packs (first useful release)

**Goal:** the thing people actually want — get my add-on out of my phone.

- `.mcpack` (single pack) and `.mcaddon` (bundle) export.
- Reproducible archives: sorted entries, fixed mtime, stable compression level. Same input →
  byte-identical output, so a hash is a real check.
- Documented `--json` schema, versioned, for agents and other tools.
- Termux install documentation that a beginner can follow.
- First npm publish with provenance.

**Exit:** byte-identical zips on Linux x64 and Termux aarch64; `0.1.0` on npm.

---

## v0.1.1 — termux hardening

- `NodeHost` polish: symlink safety, path containment, permission errors as diagnostics.
- `watch` mode with debounce.
- Wake-lock wrapper around long jobs.
- `scripts/termux-check.sh` green on a real device, with numbers in the README.

**Exit:** 1000-file pack diagnosed in under 3s and under 400MB RSS on a mid-range phone.

---

## v0.2.0 — tui (first release that feels good)

- Project tree, diagnostics pane, jump-to-file, fix preview, pack with progress, help overlay.
- Responsive at 60x20 and at 120x40; keyboard only, no mouse.
- Mouse-free but touch-tolerant: large hit targets where a terminal allows.

**Exit:** a full inspect → fix → pack cycle without leaving the TUI.

---

## v0.3.0 — talks

- MCP server over stdio and Streamable HTTP.
- Tools mirror core operations; resources expose project files; one `apply_patch` mutator.
- `bugrock mcp` subcommand.

**Exit:** an MCP client can create, diagnose, fix and pack a project end to end.

---

## v0.4.0 — serves

- Hono daemon on `127.0.0.1` with pairing tokens and origin allowlisting.
- Capability descriptor at `/v1/hello`; jobs + SSE progress.
- Survives process death: idempotent mutations, etag-based resync.

**Exit:** daemon contract test suite green; killing the process mid-job loses no committed work.

---

## v0.5.0 — edits

- Read-write operations: `applyPatch`, undo/redo journal, path containment tests.
- Schema-driven field model in core (no UI yet).
- Reference graph for entities, blocks, items, so a rename can be checked before it happens.

**Exit:** a manifest field edited via CLI and TUI, with undo.

---

## v0.6.0 — web

- PWA on GitHub Pages; OPFS as the source of truth; `BrowserHost`.
- CodeMirror 6 viewer/editor, Ajv standalone validators in a worker.
- Share-sheet import of `.mcaddon`, bridge detection when a daemon is present.
- Budgets enforced in CI: 250KB gzip initial, 2s TTI on a mid-range Android.

**Exit:** full flow offline on Android Chrome and iOS Safari.

---

## v0.7.0 — syncs

- Git-backed sync, conflict resolution keyed on manifest UUIDs.
- Signed-commit automation for user projects.

**Exit:** phone → git → desktop round trip with no data loss.

---

## v1.0.0 — stable

- API freeze, semver guarantees, migration guide.
- Plugin API, docs site, budgets in CI, supported-release policy in `SECURITY.md`.

---

## Explicitly not planned

Monaco, 3D/Babylon preview, Blockly, Electron or Tauri shells, telemetry, an account system, a
marketplace. Each is a real feature; none is on the path to "works on my phone".

# Termux notes

Termux is the reference mobile environment: a real Linux userland on Android, no root, no Electron.

## Setup

```sh
pkg update
pkg install nodejs-lts git python
corepack enable
git clone https://github.com/indpriyanshuraj-bot/bugrock-creator-editor
cd bugrock-creator-editor
pnpm install
```

## Things that will bite you

- **Android kills background processes.** Hold `termux-wake-lock` around long jobs and acquire a
  notification. Never assume a daemon is still alive; the design assumes it died.
- **No native modules.** `better-sqlite3` needs a full node-gyp toolchain. Use WASM or JSON. The
  one exception is build tooling: `rolldown` and `esbuild` ship `android-arm64` binaries, so
  building works.
- **Storage.** `~/storage/shared` is shared storage and is slow. Keep working projects in
  `$HOME`. Do not put a git repo on shared storage.
- **Memory.** A mid-range phone gives you roughly 400MB of comfortable headroom. The core streams
  per file; nothing loads a whole pack into memory at once except `pack()`, which has to.
- **Keyboard.** Hardware keyboards work; the soft keyboard has no arrow keys worth using. The TUI
  binds single letters for a reason.

## Checking a device

```sh
./scripts/termux-check.sh ./path/to/addon
```

Paste the output into any PR that touches `packages/core`.

#!/data/data/com.termux/files/usr/bin/bash
# Manual mobile smoke check. GitHub-hosted runners cannot be Termux, so this runs on a device.
set -euo pipefail

echo "== environment =="
uname -m
node --version
echo "cores: $(nproc)"

command -v termux-wake-lock >/dev/null && termux-wake-lock && echo "wake-lock: held"

echo "== install =="
corepack enable || true
pnpm install --frozen-lockfile

echo "== checks =="
pnpm run check:boundary
pnpm run typecheck
pnpm test

echo "== memory + timing =="
/usr/bin/time -v pnpm --filter @bugrock/cli exec bugrock diagnose "${1:-./fixtures/sample}" 2>&1 | \
  grep -E "Maximum resident|Elapsed" || true

command -v termux-wake-unlock >/dev/null && termux-wake-unlock || true
echo "done"

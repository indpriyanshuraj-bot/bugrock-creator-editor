# Contributing

## Ground rules

1. **DCO, not a CLA.** Every commit needs `Signed-off-by:` with your real email. Use
   `git commit -s`. CI enforces it (`scripts/check-dco.mjs`).
2. **Never copy code from `bridge-core/editor`.** It is GPL-3.0 and this project is Apache-2.0;
   linking it would force the whole distribution to GPL-3.0. Reading it for behaviour is fine,
   copying is not. Reviewers must reject any PR that looks transcribed.
3. **`packages/core` stays pure.** No `node:*`, no `document`/`window`/`navigator`, no imports from
   sibling packages. `pnpm check:boundary` fails the build otherwise.
4. **Never commit Minecraft assets.** Anything under `res/latest/van` in upstream projects is
   covered by the Minecraft EULA. Do not vendor it, do not paste it into a fixture.

## Commit trailers

```
feat(core): add duplicate-uuid detection

Explain why, not what.

Co-authored-by: Priyanshu Raj <243560345+indpriyanshuraj@users.noreply.github.com>
Co-authored-by: sarvam-agents[bot] <330910099+sarvam-agents[bot]@users.noreply.github.com>
Signed-off-by: <committer> <committer@example.com>
```

`Co-authored-by` gives attribution. It is not a signature: only the committer can sign. Add
`Reviewed-by:` only when a human actually reviewed the change.

## Branching

Work on `feat/*` or `fix/*`. `main` is protected and linear: squash-merge, preserving trailers.
Every merge to `main` deploys to GitHub Pages.

## Local checks

```sh
pnpm check:boundary
pnpm typecheck
pnpm test
```

Termux cannot be a GitHub-hosted runner, so `scripts/termux-check.sh` is run manually on a device.
Paste its output in the PR when you touch `packages/core`.

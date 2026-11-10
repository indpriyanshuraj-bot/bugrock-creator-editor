#!/usr/bin/env bash
# Push the prepared initial commit. Run this yourself, on a machine with your signing key.
#
#   ./scripts/push-initial.sh git@github.com:indpriyanshuraj/bugrock-creator-editor.git
#
# What it does:
#   1. adds your remote
#   2. re-creates the initial commit so it is signed with YOUR key (a signature can only ever be
#      made by the committer, so this step cannot be done for you)
#   3. pushes the branch
set -euo pipefail

REMOTE="${1:?usage: push-initial.sh <remote-url>}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if ! git config --get user.signingkey >/dev/null; then
  echo "No signing key configured." >&2
  echo "  git config --global gpg.format ssh" >&2
  echo "  git config --global user.signingkey ~/.ssh/id_ed25519.pub" >&2
  echo "  git config --global commit.gpgsign true" >&2
  echo "Then add that key on GitHub as a SIGNING key (Settings > SSH and GPG keys)." >&2
  exit 1
fi

git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"

# Re-sign the single root commit without changing its message or trailers.
git commit --amend --no-edit -S
git log -1 --format='%H%n%G?%n%B' | head -20

git push -u origin "$BRANCH"
echo
echo "Pushed $BRANCH. Next, in the GitHub UI or with a token that has admin rights:"
echo "  1. Settings > Actions > General > allow all actions"
echo "  2. Settings > Pages > Source: GitHub Actions"
echo "  3. Open a PR from $BRANCH into main"

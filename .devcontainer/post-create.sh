#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# --- Safety FIRST: never leave a fresh codespace sitting on master -------------
# Runs before anything else, and unconditionally (not gated behind `set -e` on
# a later step) -- this is the actual safety mechanism for the tools that get
# real write/edit/shell access below, so it must not be skippable by an
# unrelated install failure.
current_branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
if [ "$current_branch" = "master" ]; then
  git checkout -b "codespace/$(date +%Y%m%d-%H%M%S)"
fi

# --- openrestaurant/ + open-deep-research/: Python via uv, one combined venv ---
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv sync
.venv/bin/python openrestaurant/data/seed_db.py

# --- opencode-harness/: Bun + TypeScript, opencode's real stack -----------------
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
(cd opencode-harness && bun install)

# ripgrep: opencode's real grep/glob tools shell out to the actual `rg` binary --
# not bundled in the base python:3.11 image. Best-effort: if this fails (e.g.
# no passwordless sudo in some environment), don't take down the rest of setup
# over it -- everything except the tools topic's grep/glob still works fine.
if ! command -v rg >/dev/null 2>&1; then
  sudo apt-get update -qq && sudo apt-get install -y -qq ripgrep || \
    echo "warning: could not install ripgrep -- 02-tools grep/glob will fail until it's installed manually"
fi

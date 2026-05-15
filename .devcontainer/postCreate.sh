#!/usr/bin/env bash
set -euo pipefail

# Take ownership of persistent volumes mounted as root
sudo chown -R node:node \
  /home/node/.claude \
  /home/node/.config/gh \
  /home/node/.cache/ms-playwright

# Permissive Claude Code settings (idempotent — only writes if absent)
bash .devcontainer/setup-claude-settings.sh

# Trust workspace despite root-owned bind-mounted files (Windows host artifact)
git config --global --add safe.directory /workspaces/timeline-controller

# Toolchain sanity check
node --version
npm --version

#!/usr/bin/env bash
# Claudeboard installer
set -euo pipefail

INSTALL_DIR="$HOME/.claude/dashboard"
HOOK_SRC="$(cd "$(dirname "$0")" && pwd)/hooks/plan-autotag.sh"
HOOK_DEST="$HOME/.claude/hooks/plan-autotag.sh"

# Check Node.js version
if ! command -v node &>/dev/null; then
  echo "Error: node is not installed. Install Node.js 18 or later and try again." >&2
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Error: Node.js 18+ required (found $(node --version))." >&2
  exit 1
fi

echo "Node.js $(node --version) OK"

# Validate install directory
if [[ ! -d "$INSTALL_DIR" ]]; then
  echo "Error: Install directory does not exist: $INSTALL_DIR" >&2
  echo "Clone the repository there first, then re-run this script." >&2
  exit 1
fi

# Install dependencies
cd "$INSTALL_DIR"
echo "Installing dependencies..."
npm install

echo ""
echo "Claudeboard installed."
echo ""
echo "Start with:"
echo "  node $INSTALL_DIR/server.js"
echo ""

# Offer alias
ALIAS_LINE="alias claudeboard=\"node $INSTALL_DIR/server.js\""
RC_FILE=""
if [[ -f "$HOME/.zshrc" ]]; then
  RC_FILE="$HOME/.zshrc"
elif [[ -f "$HOME/.bashrc" ]]; then
  RC_FILE="$HOME/.bashrc"
fi

if [[ -n "$RC_FILE" ]]; then
  if ! grep -q "alias claudeboard=" "$RC_FILE" 2>/dev/null; then
    read -r -p "Add 'claudeboard' alias to $RC_FILE? [y/N] " yn
    if [[ "$yn" =~ ^[Yy]$ ]]; then
      echo "" >> "$RC_FILE"
      echo "$ALIAS_LINE" >> "$RC_FILE"
      echo "Alias added. Run 'source $RC_FILE' to activate."
    fi
  else
    echo "Alias already present in $RC_FILE."
  fi
fi

# Offer hook installation
if [[ -f "$HOOK_SRC" ]]; then
  echo ""
  if [[ -f "$HOOK_DEST" ]]; then
    echo "Plan auto-tag hook already installed at $HOOK_DEST."
  else
    read -r -p "Install plan auto-tag hook to ~/.claude/hooks/? [y/N] " yn
    if [[ "$yn" =~ ^[Yy]$ ]]; then
      mkdir -p "$HOME/.claude/hooks"
      cp "$HOOK_SRC" "$HOOK_DEST"
      chmod +x "$HOOK_DEST"
      echo "Hook installed at $HOOK_DEST."
      echo ""
      echo "Register it in ~/.claude/settings.json under hooks.PostToolUse."
      echo "See README.md for the exact JSON."
    fi
  fi
fi

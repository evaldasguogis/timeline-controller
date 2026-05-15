#!/usr/bin/env bash
set -euo pipefail

settings=/home/node/.claude/settings.json

if [ -f "$settings" ]; then
  exit 0
fi

mkdir -p "$(dirname "$settings")"
cat > "$settings" <<'JSON'
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "attribution": {
    "commit": "",
    "pr": ""
  },
  "permissions": {
    "defaultMode": "default",
    "allow": [
      "Bash(*)",
      "Edit",
      "Write",
      "Read",
      "Glob",
      "Grep",
      "WebFetch",
      "WebSearch",
      "Agent",
      "NotebookEdit",
      "TodoWrite"
    ],
    "ask": [
      "Bash(git push*)",
      "Bash(git remote add*)",
      "Bash(git remote set-url*)",
      "Bash(git remote remove*)",
      "Bash(gh repo create*)",
      "Bash(gh repo delete*)",
      "Bash(gh repo edit*)",
      "Bash(gh repo rename*)",
      "Bash(gh pr create*)",
      "Bash(gh pr merge*)",
      "Bash(gh pr close*)",
      "Bash(gh pr edit*)",
      "Bash(gh pr comment*)",
      "Bash(gh pr review*)",
      "Bash(gh issue create*)",
      "Bash(gh issue close*)",
      "Bash(gh issue edit*)",
      "Bash(gh issue comment*)",
      "Bash(gh release create*)",
      "Bash(gh release delete*)",
      "Bash(gh release edit*)"
    ]
  }
}
JSON

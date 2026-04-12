#!/usr/bin/env bash
# PostToolUse hook: auto-tag new plan files with cwd-derived tags
# Fires after Claude uses the Write tool. Checks if the file landed in ~/.claude/plans/

set -euo pipefail

PLANS_DIR="$HOME/.claude/plans"
USERNAME=$(basename "$HOME")
IGNORE_SEGMENTS="home $USERNAME"

PAYLOAD=$(cat)

TOOL_NAME=$(echo "$PAYLOAD" | jq -r '.tool_name // ""')
if [[ "$TOOL_NAME" != "Write" ]]; then
    exit 0
fi

FILE_PATH=$(echo "$PAYLOAD" | jq -r '.tool_input.file_path // ""')
CWD=$(echo "$PAYLOAD" | jq -r '.cwd // ""')

# Only act on .md files written into the plans dir
if [[ "$FILE_PATH" != "$PLANS_DIR"/*.md ]]; then
    exit 0
fi

if [[ ! -f "$FILE_PATH" ]]; then
    exit 0
fi

CONTENT=$(cat "$FILE_PATH")

# Skip if frontmatter already exists
if echo "$CONTENT" | grep -q "^---"; then
    exit 0
fi

# Parse cwd path segments into tags, skipping ignored ones
TAGS=()
IFS='/' read -ra PARTS <<< "$CWD"
for part in "${PARTS[@]}"; do
    part_lower=$(echo "$part" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
    [[ -z "$part_lower" ]] && continue
    skip=false
    for ignore in $IGNORE_SEGMENTS; do
        [[ "$part_lower" == "$ignore" ]] && skip=true && break
    done
    $skip && continue
    TAGS+=("$part_lower")
done

if [[ ${#TAGS[@]} -eq 0 ]]; then
    exit 0
fi

# Build YAML inline array: ["tag1", "tag2"]
TAG_YAML="["
for i in "${!TAGS[@]}"; do
    [[ $i -gt 0 ]] && TAG_YAML+=", "
    TAG_YAML+="\"${TAGS[$i]}\""
done
TAG_YAML+="]"

# Prepend frontmatter
TMPFILE=$(mktemp)
printf -- '---\ntags: %s\n---\n%s' "$TAG_YAML" "$CONTENT" > "$TMPFILE"
mv "$TMPFILE" "$FILE_PATH"

# Claudeboard

The missing session history browser for Claude Code.

A local web dashboard that gives you a searchable UI for everything Claude Code stores on disk: sessions, plans, memories, tasks, plugins, and config files.

## What it is

Claude Code writes a lot of data to `~/.claude/` — session transcripts, plan files, memory notes, todos — with no built-in way to browse it. Claudeboard reads that data live and presents it in a clean interface.

**Highlights:**
- Browse and search all Claude Code session transcripts
- Resume sessions in one click — copies `cd <dir> && claude --resume <id>` or `/resume <id>` for active sessions
- Manage plans with tag filtering and inline tag editing
- Read and edit all CLAUDE.md config files across your projects
- View memories, tasks, plugins, and settings

## Requirements

- Node.js 18 or later
- Claude Code installed and used at least once (so `~/.claude/` exists)
- macOS or Linux (Windows is not supported)

## Install

```bash
git clone https://github.com/joselogil/claudeboard.git ~/.claude/dashboard
cd ~/.claude/dashboard
npm install
```

## Start

```bash
node ~/.claude/dashboard/server.js
# → http://localhost:3434
```

Add an alias to your shell rc file for convenience:

```bash
alias claudeboard="node ~/.claude/dashboard/server.js"
```

Or use `npm start` from the dashboard directory.

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3434` | Port to listen on |
| `HOST` | `127.0.0.1` | Host to bind to (localhost only by default) |
| `CLAUDEBOARD_DATA_DIR` | `~/.claude` | Directory containing Claude Code data |
| `CLAUDEBOARD_TRASH_DIR` | `~/.claude/dashboard/trash` | Where deleted items are moved |
| `CLAUDEBOARD_SCAN_ROOTS` | _(none)_ | Colon-separated extra directories to scan for CLAUDE.md config files, in addition to `$HOME` |

Example:

```bash
PORT=8080 CLAUDEBOARD_SCAN_ROOTS="/work/projects:/opt/dev" node server.js
```

## Plan Auto-Tagging Hook

Claudeboard includes an optional shell hook that automatically tags new plan files with tags derived from the current working directory when Claude creates them.

The hook requires [`jq`](https://jqlang.github.io/jq/). On macOS install it with `brew install jq`; on Debian/Ubuntu with `apt install jq`.

### Setup

1. Copy the hook to your Claude hooks directory (it may already be there if you cloned into `~/.claude/dashboard/`):

```bash
cp ~/.claude/dashboard/hooks/plan-autotag.sh ~/.claude/hooks/plan-autotag.sh
chmod +x ~/.claude/hooks/plan-autotag.sh
```

2. Register it in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/plan-autotag.sh"
          }
        ]
      }
    ]
  }
}
```

When Claude writes a new `.md` file to `~/.claude/plans/`, the hook fires and prepends YAML frontmatter with tags derived from path segments of the current working directory.

Example: if your cwd is `/home/alice/work/myproject`, the plan gets tagged `["work", "myproject"]`.

## Known Limitations

- **Session format is internal.** The `.jsonl` format in `~/.claude/projects/` is undocumented and reverse-engineered. Anthropic can change it without notice; if sessions appear empty after a Claude Code update, the parser likely needs updating.
- **Orphaned projects have no path.** Claude Code encodes project directories as hyphen-separated keys (e.g. `-home-alice-my-app`). Claudeboard recovers the real path from `cwd` in session metadata. If a project directory has no sessions, `projectPath` is `null` — the old heuristic of decoding hyphens as slashes was removed because it corrupts paths with real hyphens (e.g. `my-app` → `my/app`).
- **Windows is not supported.** The path conventions and hook scripts assume POSIX.
- **Single-user, local-only.** No auth, no cloud, no data leaves the machine. Not intended to be exposed on a network interface.

## Architecture

No build step. Vanilla HTML/CSS/JS frontend with hash-based routing. All data is read live from `~/.claude/` on each request, except `scanProjectDirs()` which caches for 60 seconds.

```
~/.claude/dashboard/
├── server.js       Express server (port 3434) — all API routes
├── scanner.js      Data parsing — one function per data source
├── package.json
├── tests/
│   ├── helpers.js        Fixture builders + setupServer/teardownServer
│   ├── scanner.test.js   Unit tests for all scanner functions
│   └── server.test.js    Integration tests for all API routes
└── public/
    ├── index.html
    ├── style.css
    ├── app.js
    └── vendor/
        └── marked.min.js
```

| Section | Source |
|---|---|
| Sessions | `~/.claude/projects/*/*.jsonl` |
| Plans | `~/.claude/plans/*.md` |
| Memories | `~/.claude/projects/*/memory/*.md` |
| Plugins | `~/.claude/plugins/installed_plugins.json` |
| Settings | `~/.claude/settings.json` |
| Projects | `~/.claude/projects/` dirs |
| Configs | `CLAUDE.md` files across `$HOME` and `CLAUDEBOARD_SCAN_ROOTS` |
| Tasks | `~/.claude/todos/*.json` |

## Contributing

The stack is intentionally simple: edit `public/app.js`, reload the browser, see the result. No compilation required.

Please open an issue before submitting a large PR.

## License

MIT

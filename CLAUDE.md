# Claudeboard

A local web dashboard for browsing all Claude Code data. Lives at `~/.claude/dashboard/`.

## Launch

```bash
node ~/.claude/dashboard/server.js
# → http://localhost:3434
```

Node 18+ (tested on v25.5.0). Dependencies: express (runtime), vitest + supertest (test).

## File Map

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
    ├── index.html  SPA shell + sidebar nav
    ├── style.css   Minimalist light theme (CSS variables in :root)
    └── app.js      Client routing, all views, modal system
```

## Architecture

- No build step. Vanilla HTML/CSS/JS frontend.
- All data read live from `~/.claude/` on each request (no caching except `scanProjectDirs` which caches 60s).
- Frontend uses hash-based routing (`#overview`, `#plans`, etc). Views are functions on the `views` object.
- Modal system: `openModal(html)` / `closeModal()` — used for plan content and session threads.

## Data Sources

| Section | Source | Key scanner fn |
|---|---|---|
| Sessions | `~/.claude/projects/*/*.jsonl` | `parseSessions()`, `parseSessionFileMessages()` |
| Plans | `~/.claude/plans/*.md` | `parsePlans()` |
| Memories | `~/.claude/projects/*/memory/*.md` | `parseMemories()` |
| Plugins | `~/.claude/plugins/installed_plugins.json` | `parsePlugins()` |
| Settings | `~/.claude/settings.json` | `parseSettings()` |
| Projects | `~/.claude/projects/` dirs | `scanProjectDirs()` |
| Configs | `CLAUDE.md`, `CLAUDE.local.md`, `RTK.md`, `AGENTS.md`, `GEMINI.md`, `COPILOT.md` across `~/` and `CLAUDEBOARD_SCAN_ROOTS` | `scanClaudeConfigs()` |
| Todos | `~/.claude/todos/*.json` | `parseTodos()` |

## API Routes

```
GET  /api/meta                                — homedir, version
GET  /api/stats
GET  /api/conversations?q=&project=&limit=&offset=   — session list
GET  /api/conversations/:project/:sessionId   — full message thread
DELETE /api/conversations/:project/:sessionId — moves to trash
GET  /api/plans?q=&tag=&limit=
GET  /api/plans/tags
GET  /api/plans/:name
PATCH /api/plans/:name/tags                   — save tags to frontmatter
DELETE /api/plans/:name                       — moves to trash
GET  /api/memories?q=
DELETE /api/memories/:project/:file           — moves to trash
GET  /api/todos
GET  /api/plugins
POST /api/plugins/:name/enable
POST /api/plugins/:name/disable
DELETE /api/plugins/:name
GET  /api/marketplaces
GET  /api/settings
GET  /api/projects
DELETE /api/projects/:key                     — moves to trash
GET  /api/configs
GET  /api/configs/content?file=
PUT  /api/configs/content                     — save config file edits
GET  /api/trash
POST /api/trash/:file/restore
DELETE /api/trash/:file                       — permanent delete
```

## Trash

Files moved to `~/.claude/dashboard/trash/`. Each trashed item gets a `<timestamp>__<name>` file plus a `.meta.json` sidecar storing `originalPath` and `trashedAt`. Restore uses `fs.renameSync` back to `originalPath`. Permanent delete uses `fs.rmSync` (recursive for dirs).

## Plan Tagging

Plans store tags in YAML frontmatter:
```markdown
---
tags: ["work", "myproject"]
---
# Plan title...
```

Auto-tagging hook: `~/.claude/hooks/plan-autotag.sh` — registered as `PostToolUse` on `Write` in `~/.claude/settings.json`. Fires when a `.md` file is written to `~/.claude/plans/`, injects tags derived from `cwd` path segments. Skips `home` and the current `$USER` segment. Requires `jq` (macOS: `brew install jq`).

`parseTags()` in scanner.js handles `["a","b"]`, `[a, b]`, and `a, b` formats.

## Views

- **Overview** — stat cards + latest 10 plans + last 10 sessions
- **Sessions** — real `.jsonl` transcript browser, search by message/project/branch, click to read full thread; Resume button copies `cd <dir> && claude --resume <id>`, In Claude button copies `/resume <id>` for active sessions
- **Plans** — card grid, tag filter bar, inline tag editor, search, trash
- **Memories** — grouped by project, expandable, search, trash
- **Tasks** — todos grouped by session
- **Plugins** — table, none currently enabled
- **Configs** — split layout: file list + editable textarea, Ctrl+S to save
- **Settings** — read-only JSON view
- **Projects** — table with CLAUDE.md / memory indicators, trash
- **Trash** — restore or permanently delete

## Tests

```bash
npm test        # run all tests (vitest)
```

Tests across two files (run `npm test` to see current count):
- `scanner.test.js` — unit tests for every scanner function, using isolated tmp fixtures
- `server.test.js` — integration tests for every API route via supertest

Each test gets its own temp `~/.claude/` directory via `createFixture()` in `helpers.js`.
`setupServer()` / `teardownServer()` handle the full server lifecycle (env vars, module cache, cleanup).
Scanner tests use `loadScanner(claudeDir)` — required after setting env because scanner reads `CLAUDEBOARD_DATA_DIR` at require-time.

## Known Quirks

- `scanClaudeConfigs()` skips dir names: `node_modules`, `.git`, `vendor`, `dist`, `build`, `.next`, `__pycache__`, `target`, `extensions`, `marketplaces`; and absolute paths: `~/.claude/plugins`, `~/.claude/cache`, `~/.vscode`, `~/.cache`, `~/.npm`, `~/.nvm`.
- Session `.jsonl` files skip `isMeta: true` messages and lines starting with `<local-command` or `<command-name>`.
- Plans search runs server-side (reads full file content). Memories search also server-side.
- `projectPath` for sessions comes from `cwd` in the session's system metadata line. Orphaned project dirs (no sessions) have `projectPath: null` — the old hyphen-decoding heuristic (`-home-alice-my-app` → `/home/alice/my/app`) was removed because it corrupts paths with real hyphens (e.g. `my-app` → `my/app`).

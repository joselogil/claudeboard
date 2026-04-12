const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = process.env.CLAUDEBOARD_DATA_DIR || path.join(os.homedir(), '.claude');

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const fm = {};
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) {
      fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return { frontmatter: fm, body: match[2] };
}

function parseTags(raw) {
  if (!raw) return [];
  // Handles: ["a", "b"] or [a, b] or a, b
  const cleaned = raw.trim().replace(/^\[|\]$/g, '');
  return cleaned.split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

// Core JSONL parser — returns { messages, meta } from a session file
function parseJsonlFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const messages = [];
  let meta = {};

  for (const line of lines) {
    let d;
    try { d = JSON.parse(line); } catch { continue; }

    if (d.type === 'system' && d.subtype === 'turn_duration') {
      meta = {
        cwd: d.cwd || '',
        gitBranch: d.gitBranch || '',
        sessionId: d.sessionId || '',
        version: d.version || '',
        slug: d.slug || '',
      };
    }

    if (d.type === 'user' && !d.isMeta) {
      const content = d.message?.content;
      let text = '';
      if (typeof content === 'string') text = content;
      else if (Array.isArray(content)) {
        text = content.filter(c => c.type === 'text').map(c => c.text).join(' ');
      }
      if (text && !text.startsWith('<local-command') && !text.startsWith('<command-name>')) {
        messages.push({ role: 'user', text: text.trim(), ts: d.timestamp });
      }
    }

    if (d.type === 'assistant') {
      const content = d.message?.content || [];
      const text = content.filter(c => c.type === 'text').map(c => c.text).join(' ').trim();
      if (text) {
        messages.push({ role: 'assistant', text, ts: d.timestamp });
      }
    }
  }

  return { messages, meta };
}

// Lightweight cwd extraction — scans for turn_duration only, skips message parsing
function extractCwd(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.type === 'system' && d.subtype === 'turn_duration' && d.cwd) {
      return d.cwd;
    }
  }
  return '';
}

function parseSessionFile(filePath) {
  const { messages, meta } = parseJsonlFile(filePath);
  const stat = fs.statSync(filePath);
  const firstUserMsg = messages.find(m => m.role === 'user');
  const firstTs = messages[0]?.ts || stat.mtime.toISOString();
  const lastTs = messages[messages.length - 1]?.ts || stat.mtime.toISOString();

  return {
    file: path.basename(filePath),
    sessionId: path.basename(filePath, '.jsonl'),
    meta,
    firstMessage: firstUserMsg?.text?.slice(0, 120) || '(empty)',
    messageCount: messages.length,
    firstTs,
    lastTs,
    size: stat.size,
  };
}

function parseSessionFileMessages(filePath) {
  const { messages, meta } = parseJsonlFile(filePath);
  return { messages, projectPath: meta.cwd || null };
}

function parseSessions() {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  const sessions = [];

  for (const proj of fs.readdirSync(projectsDir)) {
    const projDir = path.join(projectsDir, proj);
    let files;
    try { files = fs.readdirSync(projDir).filter(f => f.endsWith('.jsonl')); }
    catch { continue; }

    for (const f of files) {
      try {
        const summary = parseSessionFile(path.join(projDir, f));
        summary.project = proj;
        summary.projectPath = summary.meta.cwd || null;
        sessions.push(summary);
      } catch {}
    }
  }

  sessions.sort((a, b) => b.lastTs.localeCompare(a.lastTs));
  return sessions;
}

function parsePlans() {
  const plansDir = path.join(CLAUDE_DIR, 'plans');
  if (!fs.existsSync(plansDir)) return [];
  return fs.readdirSync(plansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(plansDir, f);
      const stat = fs.statSync(filePath);
      const raw = fs.readFileSync(filePath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(raw);
      const headingMatch = raw.match(/^#\s+(.+)$/m);
      return {
        name: f,
        heading: headingMatch ? headingMatch[1] : f,
        tags: parseTags(frontmatter.tags),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        content: raw,
        body, // content without frontmatter, for cleaner search
      };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function parseMemories() {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  const projectPathMap = Object.fromEntries(scanProjectDirs().map(p => [p.key, p.path]));
  const memories = [];
  for (const proj of fs.readdirSync(projectsDir)) {
    const projDir = path.join(projectsDir, proj);
    const memDir = path.join(projDir, 'memory');
    if (!fs.existsSync(memDir)) continue;

    const projectPath = projectPathMap[proj] || null;

    for (const f of fs.readdirSync(memDir)) {
      if (!f.endsWith('.md') || f === 'MEMORY.md') continue;
      const filePath = path.join(memDir, f);
      const content = fs.readFileSync(filePath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(content);
      memories.push({
        project: proj,
        file: f,
        projectPath,
        name: frontmatter.name || f,
        type: frontmatter.type || 'unknown',
        description: frontmatter.description || '',
        body: body.trim(),
      });
    }
  }
  return memories;
}


function parseTodos() {
  const todosDir = path.join(CLAUDE_DIR, 'todos');
  if (!fs.existsSync(todosDir)) return [];
  const all = [];
  for (const f of fs.readdirSync(todosDir)) {
    if (!f.endsWith('.json')) continue;
    const data = readJsonSafe(path.join(todosDir, f));
    if (Array.isArray(data) && data.length > 0) {
      all.push({ file: f, sessionId: f.replace('.json', ''), items: data });
    }
  }
  return all;
}

function parsePlugins() {
  const pluginFile = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
  const data = readJsonSafe(pluginFile);
  if (!data || !data.plugins) return [];
  const settings = readJsonSafe(path.join(CLAUDE_DIR, 'settings.json')) || {};
  const enabled = settings.enabledPlugins || {};
  return Object.entries(data.plugins).map(([name, installs]) => {
    const latest = Array.isArray(installs) ? installs[installs.length - 1] : installs;
    let description = null;
    const pluginJson = path.join(latest.installPath, '.claude-plugin', 'plugin.json');
    if (fs.existsSync(pluginJson)) {
      const meta = readJsonSafe(pluginJson);
      description = meta?.description || null;
    }
    return {
      name,
      version: latest.version,
      scope: latest.scope,
      installedAt: latest.installedAt,
      projectPath: latest.projectPath || null,
      active: Object.keys(enabled).some(k => k === name || k.startsWith(name + '@')),
      description,
    };
  });
}

function parseSettings() {
  return readJsonSafe(path.join(CLAUDE_DIR, 'settings.json')) || {};
}

let _projectCache = null;
let _projectCacheTime = 0;

function scanProjectDirs() {
  const now = Date.now();
  if (_projectCache && now - _projectCacheTime < 60000) return _projectCache;

  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  const results = [];

  if (!fs.existsSync(projectsDir)) {
    _projectCache = results;
    _projectCacheTime = now;
    return results;
  }

  const projDirs = fs.readdirSync(projectsDir);

  for (const proj of projDirs) {
    const projDir = path.join(projectsDir, proj);

    let resolvedPath = null;
    try {
      const jsonlFiles = fs.readdirSync(projDir).filter(f => f.endsWith('.jsonl'));
      for (const f of jsonlFiles) {
        const cwd = extractCwd(path.join(projDir, f));
        if (cwd) { resolvedPath = cwd; break; }
      }
    } catch {}

    const memDir = path.join(projectsDir, proj, 'memory');
    const hasMemory = fs.existsSync(memDir);
    const memCount = hasMemory ? fs.readdirSync(memDir).filter(f => f.endsWith('.md')).length : 0;
    let hasClaudeMd = false;
    if (resolvedPath) {
      const claudeMdPath = path.join(resolvedPath, 'CLAUDE.md');
      hasClaudeMd = fs.existsSync(claudeMdPath);
    }
    results.push({
      key: proj,
      path: resolvedPath,
      hasMemory,
      memCount,
      hasClaudeMd,
    });
  }

  _projectCache = results;
  _projectCacheTime = now;
  return results;
}

// Scan for CLAUDE.md and related config files
const CLAUDE_CONFIG_NAMES = ['CLAUDE.md', 'CLAUDE.local.md', 'RTK.md', 'AGENTS.md', 'GEMINI.md', 'COPILOT.md'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', '.next', '__pycache__', 'target', 'extensions', 'marketplaces']);

function getScanRoots() {
  const extra = process.env.CLAUDEBOARD_SCAN_ROOTS
    ? process.env.CLAUDEBOARD_SCAN_ROOTS.split(':').map(p => p.trim()).filter(Boolean)
    : [];
  return [process.env.CLAUDEBOARD_DATA_DIR || os.homedir(), ...extra];
}

function scanClaudeConfigs() {
  const found = [];
  const seen = new Set();

  // Always include global ~/.claude/ files
  for (const name of CLAUDE_CONFIG_NAMES) {
    const p = path.join(CLAUDE_DIR, name);
    if (fs.existsSync(p) && !seen.has(p)) {
      seen.add(p);
      const stat = fs.statSync(p);
      found.push({ filePath: p, label: '~/.claude/' + name, scope: 'global', size: stat.size, mtime: stat.mtime.toISOString() });
    }
  }

  // Dirs to skip at any depth, plus absolute paths to never enter
  const SKIP_ABS = new Set([
    path.join(CLAUDE_DIR, 'plugins'),
    path.join(CLAUDE_DIR, 'cache'),
    path.join(os.homedir(), '.vscode'),
    path.join(os.homedir(), '.cache'),
    path.join(os.homedir(), '.npm'),
    path.join(os.homedir(), '.nvm'),
  ]);

  // Recursive scan of project roots
  function scan(dir, depth) {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (SKIP_ABS.has(full)) continue;
      if (entry.isDirectory()) {
        scan(full, depth + 1);
      } else if (entry.isFile() && CLAUDE_CONFIG_NAMES.includes(entry.name) && !seen.has(full)) {
        seen.add(full);
        const stat = fs.statSync(full);
        const label = full.replace(os.homedir(), '~');
        found.push({ filePath: full, label, scope: 'project', size: stat.size, mtime: stat.mtime.toISOString() });
      }
    }
  }

  for (const root of getScanRoots()) {
    if (fs.existsSync(root)) scan(root, 0);
  }

  found.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === 'global' ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return found;
}

function getStats() {
  const plans = parsePlans();
  const memories = parseMemories();
  const sessions = parseSessions();
  const plugins = parsePlugins();
  const projects = scanProjectDirs();
  const todos = parseTodos();
  const totalTodos = todos.reduce((s, t) => s + t.items.length, 0);
  const recent = sessions.slice(0, 10);

  return {
    conversations: sessions.length,
    plans: plans.length,
    memories: memories.length,
    plugins: plugins.length,
    projects: projects.length,
    todos: totalTodos,
    recent,
  };
}

function parseMarketplaces() {
  const known = readJsonSafe(path.join(CLAUDE_DIR, 'plugins', 'known_marketplaces.json')) || {};
  const countsData = readJsonSafe(path.join(CLAUDE_DIR, 'plugins', 'install-counts-cache.json')) || {};
  const counts = countsData.plugins || countsData;
  const result = [];

  for (const [mktName, mkt] of Object.entries(known)) {
    const manifestPath = path.join(mkt.installLocation, '.claude-plugin', 'marketplace.json');
    const manifest = readJsonSafe(manifestPath);
    if (!manifest || !manifest.plugins) continue;
    for (const p of manifest.plugins) {
      const key = `${p.name}@${mktName}`;
      result.push({
        key,
        name: p.name,
        marketplace: mktName,
        description: p.description || null,
        category: p.category || null,
        tags: p.tags || [],
        installs: counts[key]?.unique_installs ?? counts[key] ?? null,
      });
    }
  }
  return result;
}

module.exports = {
  readJsonSafe,
  parsePlans,
  parseMemories,
  parseSessions,
  parseSessionFileMessages,
  parseTodos,
  parsePlugins,
  parseMarketplaces,
  parseSettings,
  scanProjectDirs,
  scanClaudeConfigs,
  getStats,
  resetCache() { _projectCache = null; _projectCacheTime = 0; },
};

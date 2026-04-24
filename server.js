const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const scanner = require('./scanner');

const CLAUDE_DIR = process.env.CLAUDEBOARD_DATA_DIR || path.join(os.homedir(), '.claude');
const TRASH_DIR = process.env.CLAUDEBOARD_TRASH_DIR || path.join(__dirname, 'trash');
if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });

function trashFile(srcPath, originalPath) {
  const ts = Date.now();
  const base = path.basename(srcPath);
  const meta = { originalPath, trashedAt: new Date().toISOString() };
  const dest = path.join(TRASH_DIR, `${ts}__${base}`);
  fs.renameSync(srcPath, dest);
  fs.writeFileSync(dest + '.meta.json', JSON.stringify(meta, null, 2));
  return dest;
}

function createApp() {
  const app = express();
  app.use(express.json());

  app.use(express.static(path.join(__dirname, 'public')));

  const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version || '0.1.0';

  app.get('/api/meta', (req, res) => {
    res.json({ homedir: os.homedir(), version: PKG_VERSION });
  });

  app.get('/api/stats', (req, res) => {
    res.json(scanner.getStats());
  });

  app.get('/api/conversations', (req, res) => {
    const { q, project, limit = 50, offset = 0 } = req.query;
    let sessions = scanner.parseSessions();
    if (project) {
      sessions = sessions.filter(s => s.project === project);
    }
    if (q) {
      const lq = q.toLowerCase();
      sessions = sessions.filter(s =>
        s.firstMessage.toLowerCase().includes(lq) ||
        (s.projectPath || '').toLowerCase().includes(lq) ||
        (s.meta.gitBranch || '').toLowerCase().includes(lq) ||
        (s.meta.slug || '').toLowerCase().includes(lq)
      );
    }
    res.json({
      total: sessions.length,
      items: sessions.slice(Number(offset), Number(offset) + Number(limit)),
    });
  });

  app.get('/api/conversations/:project/:sessionId', (req, res) => {
    const { project, sessionId } = req.params;
    if ([project, sessionId].some(s => s.includes('..') || s.includes('/'))) {
      return res.status(400).json({ error: 'Invalid' });
    }
    const filePath = path.join(CLAUDE_DIR, 'projects', project, sessionId + '.jsonl');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const { messages, projectPath } = scanner.parseSessionFileMessages(filePath);
    res.json({ messages, projectPath });
  });

  app.get('/api/plans', (req, res) => {
    const { q, tag, limit } = req.query;
    let plans = scanner.parsePlans();
    if (tag) {
      plans = plans.filter(p => p.tags.includes(tag));
    }
    if (q) {
      const lq = q.toLowerCase();
      plans = plans.filter(p =>
        p.heading.toLowerCase().includes(lq) ||
        p.name.toLowerCase().includes(lq) ||
        p.body.toLowerCase().includes(lq) ||
        p.tags.some(t => t.toLowerCase().includes(lq))
      );
    }
    if (limit) plans = plans.slice(0, Number(limit));
    res.json(plans.map(p => ({
      name: p.name,
      heading: p.heading,
      tags: p.tags,
      size: p.size,
      mtime: p.mtime,
    })));
  });

  app.get('/api/plans/tags', (req, res) => {
    const plans = scanner.parsePlans();
    const counts = {};
    for (const p of plans) {
      for (const t of p.tags) {
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    const tags = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
    res.json(tags);
  });

  app.get('/api/plans/:name', (req, res) => {
    const plans = scanner.parsePlans();
    const plan = plans.find(p => p.name === req.params.name);
    if (!plan) return res.status(404).json({ error: 'Not found' });
    res.json(plan);
  });

  app.patch('/api/plans/:name/tags', (req, res) => {
    const name = req.params.name;
    if (name.includes('/') || name.includes('..') || !name.endsWith('.md')) {
      return res.status(400).json({ error: 'Invalid plan name' });
    }
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });

    const filePath = path.join(CLAUDE_DIR, 'plans', name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });

    const raw = fs.readFileSync(filePath, 'utf8');
    // Strip existing frontmatter if present
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

    const sanitized = tags.map(t => String(t).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-')).filter(Boolean);
    const tagLine = sanitized.length > 0
      ? `[${sanitized.map(t => `"${t}"`).join(', ')}]`
      : '[]';

    const newContent = `---\ntags: ${tagLine}\n---\n${body}`;
    fs.writeFileSync(filePath, newContent);
    res.json({ ok: true, tags: sanitized });
  });

  app.get('/api/notes', (req, res) => {
    const { q, tag, limit } = req.query;
    let notes = scanner.parseNotes();
    if (tag) {
      notes = notes.filter(n => n.tags.includes(tag));
    }
    if (q) {
      const lq = q.toLowerCase();
      notes = notes.filter(n =>
        n.heading.toLowerCase().includes(lq) ||
        n.name.toLowerCase().includes(lq) ||
        n.body.toLowerCase().includes(lq) ||
        n.tags.some(t => t.toLowerCase().includes(lq))
      );
    }
    if (limit) notes = notes.slice(0, Number(limit));
    res.json(notes.map(n => ({
      name: n.name,
      heading: n.heading,
      date: n.date,
      tags: n.tags,
      size: n.size,
      mtime: n.mtime,
    })));
  });

  app.get('/api/notes/tags', (req, res) => {
    const notes = scanner.parseNotes();
    const counts = {};
    for (const n of notes) {
      for (const t of n.tags) {
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    res.json(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })));
  });

  app.get('/api/notes/:name', (req, res) => {
    const { name } = req.params;
    if (name.includes('/') || name.includes('..') || !name.endsWith('.md')) {
      return res.status(400).json({ error: 'Invalid note name' });
    }
    const note = scanner.parseNoteFile(name);
    if (!note) return res.status(404).json({ error: 'Not found' });
    res.json(note);
  });

  app.patch('/api/notes/:name/tags', (req, res) => {
    const { name } = req.params;
    if (name.includes('/') || name.includes('..') || !name.endsWith('.md')) {
      return res.status(400).json({ error: 'Invalid note name' });
    }
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });
    const filePath = path.join(CLAUDE_DIR, 'notes', name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const raw = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, body } = scanner.parseFrontmatter(raw);
    const sanitized = tags.map(t => String(t).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-')).filter(Boolean);
    const tagLine = sanitized.length > 0 ? `[${sanitized.map(t => `"${t}"`).join(', ')}]` : '[]';
    const date = frontmatter.date || '""';
    fs.writeFileSync(filePath, `---\ndate: ${date}\ntags: ${tagLine}\n---\n${body}`);
    res.json({ ok: true, tags: sanitized });
  });

  app.get('/api/memories', (req, res) => {
    const { q } = req.query;
    let memories = scanner.parseMemories();
    if (q) {
      const lq = q.toLowerCase();
      memories = memories.filter(m =>
        m.name.toLowerCase().includes(lq) ||
        m.file.toLowerCase().includes(lq) ||
        m.description.toLowerCase().includes(lq) ||
        m.body.toLowerCase().includes(lq)
      );
    }
    res.json(memories);
  });

  app.get('/api/todos', (req, res) => {
    res.json(scanner.parseTodos());
  });

  app.get('/api/plugins', (req, res) => {
    res.json(scanner.parsePlugins());
  });

  app.get('/api/marketplaces', (req, res) => {
    res.json(scanner.parseMarketplaces());
  });

  app.get('/api/settings', (req, res) => {
    res.json(scanner.parseSettings());
  });

  app.get('/api/projects', (req, res) => {
    res.json(scanner.scanProjectDirs());
  });

  app.get('/api/configs', (req, res) => {
    res.json(scanner.scanClaudeConfigs());
  });

  app.get('/api/configs/content', (req, res) => {
    const { file } = req.query;
    if (!file || file.includes('..')) return res.status(400).json({ error: 'Invalid path' });
    const allowed = scanner.scanClaudeConfigs().map(c => c.filePath);
    if (!allowed.includes(file)) return res.status(403).json({ error: 'Not allowed' });
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    res.json({ content: fs.readFileSync(file, 'utf8') });
  });

  app.put('/api/configs/content', (req, res) => {
    const { file, content } = req.body;
    if (!file || file.includes('..')) return res.status(400).json({ error: 'Invalid path' });
    const allowed = scanner.scanClaudeConfigs().map(c => c.filePath);
    if (!allowed.includes(file)) return res.status(403).json({ error: 'Not allowed' });
    fs.writeFileSync(file, content, 'utf8');
    res.json({ ok: true });
  });

  app.post('/api/plugins/:name/enable', (req, res) => {
    const name = req.params.name;
    if (name.includes('/') || name.includes('..')) {
      return res.status(400).json({ error: 'Invalid plugin name' });
    }
    const settingsFile = path.join(CLAUDE_DIR, 'settings.json');
    const settings = scanner.readJsonSafe(settingsFile) || {};
    settings.enabledPlugins = settings.enabledPlugins || {};
    settings.enabledPlugins[name] = true;
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    res.json({ ok: true });
  });

  app.post('/api/plugins/:name/disable', (req, res) => {
    const name = req.params.name;
    if (name.includes('/') || name.includes('..')) {
      return res.status(400).json({ error: 'Invalid plugin name' });
    }
    const settingsFile = path.join(CLAUDE_DIR, 'settings.json');
    const settings = scanner.readJsonSafe(settingsFile) || {};
    if (settings.enabledPlugins) delete settings.enabledPlugins[name];
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    res.json({ ok: true });
  });

  app.delete('/api/plugins/:name', (req, res) => {
    const name = req.params.name;
    if (name.includes('/') || name.includes('..')) {
      return res.status(400).json({ error: 'Invalid plugin name' });
    }
    const pluginFile = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
    const data = scanner.readJsonSafe(pluginFile);
    if (!data || !data.plugins?.[name]) return res.status(404).json({ error: 'Plugin not found' });

    const installs = Array.isArray(data.plugins[name]) ? data.plugins[name] : [data.plugins[name]];
    const deleted = [];
    for (const install of installs) {
      if (install.installPath && fs.existsSync(install.installPath)) {
        fs.rmSync(install.installPath, { recursive: true });
        deleted.push(install.installPath);
      }
    }

    delete data.plugins[name];
    fs.writeFileSync(pluginFile, JSON.stringify(data, null, 2));

    res.json({ ok: true, deleted });
  });

  // ── Trash endpoints ──────────────────────────────────────────────

  app.delete('/api/plans/:name', (req, res) => {
    const name = req.params.name;
    if (name.includes('/') || name.includes('..') || !name.endsWith('.md')) {
      return res.status(400).json({ error: 'Invalid plan name' });
    }
    const filePath = path.join(CLAUDE_DIR, 'plans', name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    trashFile(filePath, filePath);
    res.json({ ok: true });
  });

  app.delete('/api/notes/:name', (req, res) => {
    const { name } = req.params;
    if (name.includes('/') || name.includes('..') || !name.endsWith('.md')) {
      return res.status(400).json({ error: 'Invalid note name' });
    }
    const filePath = path.join(CLAUDE_DIR, 'notes', name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    trashFile(filePath, filePath);
    res.json({ ok: true });
  });

  app.delete('/api/conversations/:project/:sessionId', (req, res) => {
    const { project, sessionId } = req.params;
    if ([project, sessionId].some(s => s.includes('/') || s.includes('..'))) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    const filePath = path.join(CLAUDE_DIR, 'projects', project, sessionId + '.jsonl');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    trashFile(filePath, filePath);
    res.json({ ok: true });
  });

  app.delete('/api/memories/:project/:file', (req, res) => {
    const { project, file } = req.params;
    if ([project, file].some(s => s.includes('/') || s.includes('..'))) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    if (!file.endsWith('.md')) return res.status(400).json({ error: 'Invalid file' });
    const filePath = path.join(CLAUDE_DIR, 'projects', project, 'memory', file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    trashFile(filePath, filePath);
    res.json({ ok: true });
  });

  app.delete('/api/projects/:key', (req, res) => {
    const key = req.params.key;
    if (key.includes('..') || key.includes('/')) return res.status(400).json({ error: 'Invalid' });
    const dirPath = path.join(CLAUDE_DIR, 'projects', key);
    if (!fs.existsSync(dirPath)) return res.status(404).json({ error: 'Not found' });
    trashFile(dirPath, dirPath);
    res.json({ ok: true });
  });

  app.get('/api/trash', (req, res) => {
    const items = fs.readdirSync(TRASH_DIR)
      .filter(f => !f.endsWith('.meta.json'))
      .map(f => {
        const metaPath = path.join(TRASH_DIR, f + '.meta.json');
        const meta = fs.existsSync(metaPath)
          ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
          : { originalPath: f, trashedAt: null };
        const stat = fs.statSync(path.join(TRASH_DIR, f));
        const isDir = stat.isDirectory();
        return { file: f, originalPath: meta.originalPath, trashedAt: meta.trashedAt, size: stat.size, isDir };
      })
      .sort((a, b) => (b.trashedAt || '').localeCompare(a.trashedAt || ''));
    res.json(items);
  });

  app.post('/api/trash/:file/restore', (req, res) => {
    const file = req.params.file;
    if (file.includes('/') || file.includes('..')) return res.status(400).json({ error: 'Invalid' });
    const src = path.join(TRASH_DIR, file);
    const metaPath = src + '.meta.json';
    if (!fs.existsSync(src)) return res.status(404).json({ error: 'Not found' });
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : null;
    if (!meta) return res.status(400).json({ error: 'No metadata — cannot restore' });
    if (fs.existsSync(meta.originalPath)) {
      return res.status(409).json({ error: 'A file already exists at the original path' });
    }
    fs.renameSync(src, meta.originalPath);
    fs.unlinkSync(metaPath);
    res.json({ ok: true, restoredTo: meta.originalPath });
  });

  app.delete('/api/trash/:file', (req, res) => {
    const file = req.params.file;
    if (file.includes('/') || file.includes('..')) return res.status(400).json({ error: 'Invalid' });
    const src = path.join(TRASH_DIR, file);
    const metaPath = src + '.meta.json';
    if (!fs.existsSync(src)) return res.status(404).json({ error: 'Not found' });
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.rmSync(src, { recursive: true });
    } else {
      fs.unlinkSync(src);
    }
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    res.json({ ok: true });
  });

  return app;
}

// When run directly with `node server.js`, start the server
if (require.main === module) {
  const PORT = process.env.PORT || 3434;
  const HOST = process.env.HOST || '127.0.0.1';
  const app = createApp();
  app.listen(PORT, HOST, () => {
    console.log(`Claude Dashboard → http://claude.localhost:${PORT}`);
  });
}

// For testing — export the factory and constants
module.exports = { createApp, CLAUDE_DIR, TRASH_DIR };

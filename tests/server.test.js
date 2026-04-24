const fs = require('fs');
const path = require('path');
const request = require('supertest');

const {
  pluginFixture,
  noteFixture,
  setupServer,
  teardownServer,
} = require('./helpers');

describe('server API', () => {
  let fixture, app, CLAUDE_DIR, TRASH_DIR;

  beforeEach(() => {
    ({ fixture, app, CLAUDE_DIR, TRASH_DIR } = setupServer('server', [pluginFixture]));
  });

  afterEach(() => {
    teardownServer(fixture);
  });

  describe('GET /api/meta', () => {
    test('returns homedir and version', async () => {
      const res = await request(app).get('/api/meta');
      expect(res.status).toBe(200);
      expect(res.body.homedir).toBeDefined();
      expect(res.body.version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('GET /api/stats', () => {
    test('returns aggregate stats', async () => {
      const res = await request(app).get('/api/stats');
      expect(res.status).toBe(200);
      expect(res.body.conversations).toBe(2);
      expect(res.body.plans).toBe(3);
      expect(res.body.memories).toBe(3);
      expect(res.body.notes).toBeDefined();
    });
  });

  describe('GET /api/conversations', () => {
    test('returns paginated sessions', async () => {
      const res = await request(app).get('/api/conversations?limit=1&offset=0');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items.length).toBe(1);
    });

    test('filters by search query', async () => {
      const res = await request(app).get('/api/conversations?q=blog');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].sessionId).toBe('def-456');
    });

    test('filters by project', async () => {
      const res = await request(app).get('/api/conversations?project=-home-testuser-work-my-project');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
    });
  });

  describe('GET /api/conversations/:project/:sessionId', () => {
    test('returns messages and projectPath for a session', async () => {
      const res = await request(app).get('/api/conversations/-home-testuser-work-my-project/abc-123');
      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBe(2); // user + assistant (meta and internal filtered out)
      expect(res.body.projectPath).toBe('/home/testuser/work/my-project');
    });

    test('returns 404 for non-existent session', async () => {
      const res = await request(app).get('/api/conversations/-fake/nonexistent');
      expect(res.status).toBe(404);
    });

    test('rejects path traversal in project', async () => {
      // Express normalizes URLs, so ..%2Fetc becomes /api/etc/passwd which won't match the route.
      // The 400 check in the handler is defense-in-depth for programmatic callers.
      // Test with a value that Express will pass through (no / in it but has ..)
      const res = await request(app).get('/api/conversations/..%252Fetc/abc');
      // Double-encoded: Express decodes once to ..%2Fetc (no slash), handler sees .. and rejects
      expect(res.status).toBe(400);
    });

    test('rejects path traversal in sessionId', async () => {
      const res = await request(app).get('/api/conversations/foo/..%252F..%252Fetc%252Fpasswd');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/plans', () => {
    test('returns plan summaries', async () => {
      const res = await request(app).get('/api/plans');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(3);
      // Should not include content field
      for (const p of res.body) {
        expect(p.name).toBeDefined();
        expect(p.content).toBeUndefined();
      }
    });

    test('filters by tag', async () => {
      const res = await request(app).get('/api/plans?tag=work');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2); // plan-one and plan-two
    });

    test('searches plans', async () => {
      const res = await request(app).get('/api/plans?q=API');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });
  });

  describe('GET /api/plans/tags', () => {
    test('returns tag counts', async () => {
      const res = await request(app).get('/api/plans/tags');
      expect(res.status).toBe(200);
      const workTag = res.body.find(t => t.tag === 'work');
      expect(workTag).toBeDefined();
      expect(workTag.count).toBe(2);
    });
  });

  describe('PATCH /api/plans/:name/tags', () => {
    test('updates tags in frontmatter', async () => {
      const expectedPath = path.join(CLAUDE_DIR, 'plans/plan-one.md');
      const res = await request(app)
        .patch('/api/plans/plan-one.md/tags')
        .send({ tags: ['updated', 'new-tag'] });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.tags).toEqual(['updated', 'new-tag']);

      const fileContent = fs.readFileSync(expectedPath, 'utf8');
      expect(fileContent).toContain('tags: ["updated", "new-tag"]');
    });

    test('sanitizes tag characters', async () => {
      const res = await request(app)
        .patch('/api/plans/plan-one.md/tags')
        .send({ tags: ['safe-tag', 'bad tag!', '<script>'] });
      expect(res.status).toBe(200);
      // 'bad tag!' → 'bad-tag-' (! replaced with -)
      expect(res.body.tags).toContain('bad-tag-');
      // '<script>' → '-script-' (angle brackets become dashes)
      expect(res.body.tags.some(t => t.includes('script'))).toBe(true);
    });

    test('rejects invalid plan names', async () => {
      // Express normalizes URL paths, so we double-encode to test the handler's defense-in-depth
      const res = await request(app)
        .patch('/api/plans/..%252F..%252Fetc%252Fpasswd.md/tags')
        .send({ tags: ['x'] });
      expect(res.status).toBe(400);
    });

    test('rejects non-.md files', async () => {
      const res = await request(app)
        .patch('/api/plans/settings.json/tags')
        .send({ tags: ['x'] });
      expect(res.status).toBe(400);
    });

    test('rejects non-array tags', async () => {
      const res = await request(app)
        .patch('/api/plans/plan-one.md/tags')
        .send({ tags: 'not-an-array' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/memories', () => {
    test('returns memories', async () => {
      const res = await request(app).get('/api/memories');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(3);
    });

    test('searches memories', async () => {
      const res = await request(app).get('/api/memories?q=dark mode');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });
  });

  describe('GET /api/todos', () => {
    test('returns empty when no todos', async () => {
      const res = await request(app).get('/api/todos');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/plugins', () => {
    test('returns installed plugins', async () => {
      const res = await request(app).get('/api/plugins');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });
  });

  describe('GET /api/settings', () => {
    test('returns settings', async () => {
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(200);
      expect(res.body.enabledPlugins).toBeDefined();
    });
  });

  describe('GET /api/projects', () => {
    test('returns project list', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });
  });

  describe('POST /api/plugins/:name/enable', () => {
    test('enables a plugin', async () => {
      const res = await request(app).post('/api/plugins/project-plugin/enable');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const settings = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8'));
      expect(settings.enabledPlugins['project-plugin']).toBe(true);
    });

    test('rejects invalid plugin names', async () => {
      // Double-encoded to bypass Express URL decoding
      const res = await request(app).post('/api/plugins/..%252Fbad/enable');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/plugins/:name/disable', () => {
    test('disables a plugin', async () => {
      const res = await request(app).post('/api/plugins/my-plugin/disable');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const settings = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8'));
      expect(settings.enabledPlugins['my-plugin']).toBeUndefined();
    });
  });

  describe('DELETE /api/plugins/:name', () => {
    test('uninstalls a plugin', async () => {
      // Create the installPath directory so it can be deleted
      const pluginPath = path.join(fixture.tmpDir, 'test-plugin-dir');
      fs.mkdirSync(pluginPath);
      const pluginFile = path.join(CLAUDE_DIR, 'plugins/installed_plugins.json');
      const data = JSON.parse(fs.readFileSync(pluginFile, 'utf8'));
      data.plugins['test-plugin'] = {
        version: '1.0.0',
        scope: 'global',
        installedAt: '2025-01-01T00:00:00.000Z',
        installPath: pluginPath,
      };
      fs.writeFileSync(pluginFile, JSON.stringify(data, null, 2));

      const res = await request(app).delete('/api/plugins/test-plugin');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(fs.existsSync(pluginPath)).toBe(false);
    });

    test('returns 404 for unknown plugin', async () => {
      const res = await request(app).delete('/api/plugins/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('Config content API', () => {
    test('reads config file content', async () => {
      // Create a config file in the mock .claude dir
      fs.writeFileSync(path.join(CLAUDE_DIR, 'CLAUDE.md'), '# Test config\n');
      // Force scanner cache reset
      const scanner = require('../scanner');
      scanner.resetCache();

      const configs = await request(app).get('/api/configs');
      const globalConfig = configs.body.find(c => c.filePath === path.join(CLAUDE_DIR, 'CLAUDE.md'));
      expect(globalConfig).toBeDefined();

      const res = await request(app).get(`/api/configs/content?file=${encodeURIComponent(globalConfig.filePath)}`);
      expect(res.status).toBe(200);
      expect(res.body.content).toBe('# Test config\n');
    });

    test('rejects path traversal', async () => {
      const res = await request(app).get('/api/configs/content?file=../../../etc/passwd');
      expect(res.status).toBe(400);
    });

    test('rejects files not in scanner allowlist', async () => {
      const randomFile = path.join(CLAUDE_DIR, 'random.txt');
      fs.writeFileSync(randomFile, 'secret');
      const res = await request(app).get(`/api/configs/content?file=${encodeURIComponent(randomFile)}`);
      expect(res.status).toBe(403);
    });
  });
});

describe('notes API', () => {
  let fixture, app, CLAUDE_DIR, TRASH_DIR;

  beforeEach(() => {
    ({ fixture, app, CLAUDE_DIR, TRASH_DIR } = setupServer('notes-api', [noteFixture]));
  });

  afterEach(() => {
    teardownServer(fixture);
  });

  describe('GET /api/notes', () => {
    test('returns note summaries without body or content', async () => {
      const res = await request(app).get('/api/notes');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(3);
      for (const n of res.body) {
        expect(n.name).toBeDefined();
        expect(n.heading).toBeDefined();
        expect(n.date).toBeDefined();
        expect(Array.isArray(n.tags)).toBe(true);
        expect(n.body).toBeUndefined();
        expect(n.content).toBeUndefined();
      }
    });

    test('searches notes by body content', async () => {
      const res = await request(app).get('/api/notes?q=xyzzy');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('note-two.md');
    });

    test('filters by tag', async () => {
      const res = await request(app).get('/api/notes?tag=bugs');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('note-two.md');
    });

    test('returns empty array when no notes match', async () => {
      const res = await request(app).get('/api/notes?q=noresultsever');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/notes/tags', () => {
    test('returns tag counts', async () => {
      const res = await request(app).get('/api/notes/tags');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const bugsTag = res.body.find(t => t.tag === 'bugs');
      expect(bugsTag).toBeDefined();
      expect(bugsTag.count).toBe(1);
    });

    test('returns empty array when no notes have tags', async () => {
      teardownServer(fixture);
      ({ fixture, app, CLAUDE_DIR, TRASH_DIR } = setupServer('notes-notags', []));
      const res = await request(app).get('/api/notes/tags');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('PATCH /api/notes/:name/tags', () => {
    test('saves tags to frontmatter', async () => {
      const res = await request(app)
        .patch('/api/notes/note-one.md/tags')
        .send({ tags: ['refactor', 'backend'] });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.tags).toEqual(['refactor', 'backend']);
      const content = fs.readFileSync(path.join(CLAUDE_DIR, 'notes/note-one.md'), 'utf8');
      expect(content).toContain('tags: ["refactor", "backend"]');
    });

    test('preserves date when updating tags', async () => {
      await request(app).patch('/api/notes/note-one.md/tags').send({ tags: ['x'] });
      const content = fs.readFileSync(path.join(CLAUDE_DIR, 'notes/note-one.md'), 'utf8');
      expect(content).toContain('date:');
    });

    test('rejects non-array tags', async () => {
      const res = await request(app)
        .patch('/api/notes/note-one.md/tags')
        .send({ tags: 'not-an-array' });
      expect(res.status).toBe(400);
    });

    test('rejects invalid note names', async () => {
      const res = await request(app)
        .patch('/api/notes/..%252F..%252Fetc.md/tags')
        .send({ tags: ['x'] });
      expect(res.status).toBe(400);
    });

    test('returns 404 for non-existent note', async () => {
      const res = await request(app)
        .patch('/api/notes/nope.md/tags')
        .send({ tags: ['x'] });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/notes/:name', () => {
    test('returns full note including body', async () => {
      const res = await request(app).get('/api/notes/note-one.md');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('note-one.md');
      expect(res.body.body).toContain('Body content of note one');
    });

    test('returns 404 for non-existent note', async () => {
      const res = await request(app).get('/api/notes/nonexistent.md');
      expect(res.status).toBe(404);
    });

    test('rejects path traversal', async () => {
      const res = await request(app).get('/api/notes/..%252F..%252Fetc%252Fpasswd.md');
      expect(res.status).toBe(400);
    });

    test('rejects non-.md filenames', async () => {
      const res = await request(app).get('/api/notes/settings.json');
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/notes/:name (trash)', () => {
    test('moves note to trash with meta sidecar', async () => {
      const notePath = path.join(CLAUDE_DIR, 'notes/note-one.md');
      const res = await request(app).delete('/api/notes/note-one.md');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(fs.existsSync(notePath)).toBe(false);

      const allTrashFiles = fs.readdirSync(TRASH_DIR);
      const trashFiles = allTrashFiles.filter(f => !f.endsWith('.meta.json'));
      const metaFiles = allTrashFiles.filter(f => f.endsWith('.meta.json'));
      expect(trashFiles.length).toBe(1);
      expect(metaFiles.length).toBe(1);

      const meta = JSON.parse(fs.readFileSync(path.join(TRASH_DIR, metaFiles[0]), 'utf8'));
      expect(meta.originalPath).toBe(notePath);
    });

    test('rejects invalid note names', async () => {
      const res = await request(app).delete('/api/notes/..%2F..%2Fetc%2Fpasswd.md');
      expect(res.status).toBe(400);
    });

    test('returns 404 for non-existent note', async () => {
      const res = await request(app).delete('/api/notes/nonexistent.md');
      expect(res.status).toBe(404);
    });
  });
});

describe('trash system', () => {
  let fixture, app, CLAUDE_DIR, TRASH_DIR;

  beforeEach(() => {
    ({ fixture, app, CLAUDE_DIR, TRASH_DIR } = setupServer('trash'));
  });

  afterEach(() => {
    teardownServer(fixture);
  });

  describe('DELETE /api/plans/:name (trash)', () => {
    test('moves plan to trash with meta sidecar', async () => {
      const planPath = path.join(CLAUDE_DIR, 'plans/plan-one.md');
      const res = await request(app).delete('/api/plans/plan-one.md');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(fs.existsSync(planPath)).toBe(false);

      // Check trash dir has the file + meta
      const allTrashFiles = fs.readdirSync(TRASH_DIR);
      const trashFiles = allTrashFiles.filter(f => !f.endsWith('.meta.json'));
      const metaFiles = allTrashFiles.filter(f => f.endsWith('.meta.json'));
      expect(trashFiles.length).toBe(1);
      expect(metaFiles.length).toBe(1);

      const meta = JSON.parse(fs.readFileSync(path.join(TRASH_DIR, metaFiles[0]), 'utf8'));
      expect(meta.originalPath).toBe(planPath);
      expect(meta.trashedAt).toBeDefined();
    });

    test('rejects invalid plan names', async () => {
      const res = await request(app).delete('/api/plans/..%2F..%2Fetc%2Fpasswd.md');
      expect(res.status).toBe(400);
    });

    test('returns 404 for non-existent plan', async () => {
      const res = await request(app).delete('/api/plans/nonexistent.md');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/conversations/:project/:sessionId (trash)', () => {
    test('moves session to trash', async () => {
      const sessionPath = path.join(CLAUDE_DIR, 'projects/-home-testuser-work-my-project/abc-123.jsonl');
      const res = await request(app).delete('/api/conversations/-home-testuser-work-my-project/abc-123');
      expect(res.status).toBe(200);
      expect(fs.existsSync(sessionPath)).toBe(false);

      const trashFiles = fs.readdirSync(TRASH_DIR).filter(f => !f.endsWith('.meta.json'));
      expect(trashFiles.length).toBe(1);
    });

    test('rejects path traversal', async () => {
      const res = await request(app).delete('/api/conversations/..%2F..%2Fetc/abc');
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/memories/:project/:file (trash)', () => {
    test('moves memory to trash', async () => {
      const memPath = path.join(CLAUDE_DIR, 'projects/-home-testuser-work-my-project/memory/preferences.md');
      const res = await request(app).delete('/api/memories/-home-testuser-work-my-project/preferences.md');
      expect(res.status).toBe(200);
      expect(fs.existsSync(memPath)).toBe(false);
    });

    test('rejects non-.md files', async () => {
      const res = await request(app).delete('/api/memories/-foo/bar.json');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/trash', () => {
    test('lists trashed items sorted by trashedAt', async () => {
      // Trash a plan first
      await request(app).delete('/api/plans/plan-one.md');

      const res = await request(app).get('/api/trash');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].originalPath).toBeDefined();
      expect(res.body[0].trashedAt).toBeDefined();
      expect(res.body[0].file).toBeDefined();
    });

    test('returns empty array when trash is empty', async () => {
      const res = await request(app).get('/api/trash');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/trash/:file/restore', () => {
    test('restores file to original path', async () => {
      const planPath = path.join(CLAUDE_DIR, 'plans/plan-one.md');
      await request(app).delete('/api/plans/plan-one.md');

      const trashRes = await request(app).get('/api/trash');
      const trashedFile = trashRes.body[0];

      const restoreRes = await request(app).post(`/api/trash/${encodeURIComponent(trashedFile.file)}/restore`);
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.ok).toBe(true);
      expect(fs.existsSync(planPath)).toBe(true);

      // Meta sidecar should be removed
      const metaFiles = fs.readdirSync(TRASH_DIR).filter(f => f.endsWith('.meta.json'));
      expect(metaFiles.length).toBe(0);
    });

    test('returns 409 if file already exists at original path', async () => {
      const planPath = path.join(CLAUDE_DIR, 'plans/plan-one.md');
      await request(app).delete('/api/plans/plan-one.md');

      // Recreate the original file
      fs.writeFileSync(planPath, '# Recreated\n');

      const trashRes = await request(app).get('/api/trash');
      const trashedFile = trashRes.body[0];

      const restoreRes = await request(app).post(`/api/trash/${encodeURIComponent(trashedFile.file)}/restore`);
      expect(restoreRes.status).toBe(409);
    });
  });

  describe('DELETE /api/trash/:file (permanent delete)', () => {
    test('permanently deletes trashed file', async () => {
      await request(app).delete('/api/plans/plan-one.md');

      const trashRes = await request(app).get('/api/trash');
      const trashedFile = trashRes.body[0];

      const deleteRes = await request(app).delete(`/api/trash/${encodeURIComponent(trashedFile.file)}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.ok).toBe(true);

      const remaining = fs.readdirSync(TRASH_DIR);
      expect(remaining.length).toBe(0);
    });

    test('returns 404 for non-existent trash file', async () => {
      const res = await request(app).delete('/api/trash/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});

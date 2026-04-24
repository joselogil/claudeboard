const fs = require('fs');
const path = require('path');

// scanner reads CLAUDEBOARD_DATA_DIR at require-time, so the env var must be
// set before require() and the module cache cleared between tests.
function loadScanner(claudeDir) {
  process.env.CLAUDEBOARD_DATA_DIR = claudeDir;
  delete require.cache[require.resolve('../scanner')];
  return require('../scanner');
}

const {
  createFixture,
  sessionFixture,
  planFixture,
  memoryFixture,
  todoFixture,
  noteFixture,
  pluginFixture,
  orphanedProjectFixture,
  hyphenProjectFixture,
} = require('./helpers');

describe('scanner', () => {
  let scanner, fixture;

  afterEach(() => {
    if (fixture) fixture.cleanup();
    delete process.env.CLAUDEBOARD_DATA_DIR;
    delete require.cache[require.resolve('../scanner')];
  });

  describe('parsePlans / parseFrontmatter / parseTags', () => {
    let plans;

    beforeEach(() => {
      fixture = createFixture('plans', planFixture);
      scanner = loadScanner(fixture.claudeDir);
      plans = scanner.parsePlans();
    });

    test('returns all plan files sorted by mtime descending', () => {
      expect(plans.length).toBe(3);
      expect(plans[0].name).toBeDefined();
      expect(plans[0].heading).toBeDefined();
      expect(plans[0].content).toBeDefined();
    });

    test('includes file size and mtime', () => {
      for (const p of plans) {
        expect(typeof p.size).toBe('number');
        expect(typeof p.mtime).toBe('string');
      }
    });

    test('parses YAML frontmatter and separates body', () => {
      const planOne = plans.find(p => p.name === 'plan-one.md');
      expect(planOne.tags).toContain('work');
      expect(planOne.tags).toContain('backend');
      expect(planOne.body).toContain('Build the API endpoints.');
    });

    test('returns empty frontmatter for files without it', () => {
      const planThree = plans.find(p => p.name === 'plan-three.md');
      expect(planThree.tags).toEqual([]);
      expect(planThree.body).toContain('Just a plan without frontmatter.');
    });

    test('handles ["a", "b"] tag format', () => {
      const planOne = plans.find(p => p.name === 'plan-one.md');
      expect(planOne.tags).toEqual(['work', 'backend']);
    });

    test('returns empty array when plans dir does not exist', () => {
      fixture.cleanup();
      fixture = createFixture('plans-empty', () => {});
      scanner = loadScanner(fixture.claudeDir);
      expect(scanner.parsePlans()).toEqual([]);
    });
  });

  describe('parseSessions', () => {
    let sessions;

    beforeEach(() => {
      fixture = createFixture('sessions', sessionFixture);
      scanner = loadScanner(fixture.claudeDir);
      sessions = scanner.parseSessions();
    });

    test('parses sessions with correct metadata', () => {
      expect(sessions.length).toBe(2);
      const s1 = sessions.find(s => s.sessionId === 'abc-123');
      expect(s1).toBeDefined();
      expect(s1.meta.cwd).toBe('/home/testuser/work/my-project');
      expect(s1.meta.gitBranch).toBe('main');
      expect(s1.meta.sessionId).toBe('abc-123');
      expect(s1.projectPath).toBe('/home/testuser/work/my-project');
    });

    test('extracts first user message as preview', () => {
      const s1 = sessions.find(s => s.sessionId === 'abc-123');
      expect(s1.firstMessage).toBe('Hello, help me build a web app');
    });

    test('sorts sessions by lastTs descending', () => {
      expect(sessions[0].lastTs).toBeDefined();
      // The def-456 session (2025-01-16) should come before abc-123 (2025-01-15)
      expect(sessions[0].sessionId).toBe('def-456');
    });

    test('sets projectPath from cwd when available', () => {
      for (const s of sessions) {
        expect(s.projectPath).not.toContain('---');
        expect(s.projectPath).toMatch(/^\//);
      }
    });
  });

  describe('parseSessionFileMessages', () => {
    test('returns messages and projectPath from cwd metadata', () => {
      fixture = createFixture('messages-filter', sessionFixture);
      scanner = loadScanner(fixture.claudeDir);
      const filePath = path.join(
        fixture.claudeDir,
        'projects/-home-testuser-work-my-project/abc-123.jsonl',
      );
      const { messages, projectPath } = scanner.parseSessionFileMessages(filePath);
      // Should have user + assistant, but NOT isMeta: true or <local-command>
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].text).toBe('Hello, help me build a web app');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].text).toBe('Sure! Let me help you with that.');
      expect(projectPath).toBe('/home/testuser/work/my-project');
    });
  });

  describe('parseMemories', () => {
    beforeEach(() => {
      fixture = createFixture('memories', (...args) => {
        sessionFixture(...args);
        memoryFixture(...args);
      });
      scanner = loadScanner(fixture.claudeDir);
    });

    test('parses memories grouped by project with frontmatter fields', () => {
      const memories = scanner.parseMemories();
      expect(memories.length).toBe(3);

      const pref = memories.find(m => m.name === 'User Preferences');
      expect(pref).toBeDefined();
      expect(pref.type).toBe('preference');
      expect(pref.description).toBe('User likes dark mode');
      expect(pref.body).toContain('dark mode');
    });

    test('skips MEMORY.md files', () => {
      const memDir = path.join(fixture.claudeDir, 'projects/-home-testuser-work-my-project/memory');
      fs.writeFileSync(path.join(memDir, 'MEMORY.md'), '# Memory\n');
      const memories = scanner.parseMemories();
      expect(memories.find(m => m.file === 'MEMORY.md')).toBeUndefined();
    });

    test('returns empty array when no memories exist', () => {
      fixture.cleanup();
      fixture = createFixture('memories-empty', () => {});
      scanner = loadScanner(fixture.claudeDir);
      expect(scanner.parseMemories()).toEqual([]);
    });
  });

  describe('parseTodos', () => {
    test('parses todo groups by session', () => {
      fixture = createFixture('todos', (...args) => {
        sessionFixture(...args);
        todoFixture(...args);
      });
      scanner = loadScanner(fixture.claudeDir);
      const todos = scanner.parseTodos();
      expect(todos.length).toBe(2);
      expect(todos[0].items.length).toBe(3);
      expect(todos[0].sessionId).toBe('abc-123');
    });

    test('returns empty array when no todos dir exists', () => {
      fixture = createFixture('todos-empty', () => {});
      scanner = loadScanner(fixture.claudeDir);
      expect(scanner.parseTodos()).toEqual([]);
    });
  });

  describe('parsePlugins', () => {
    test('parses installed plugins with active status', () => {
      fixture = createFixture('plugins', pluginFixture);
      scanner = loadScanner(fixture.claudeDir);
      const plugins = scanner.parsePlugins();
      expect(plugins.length).toBe(2);

      const globalPlugin = plugins.find(p => p.name === 'my-plugin');
      expect(globalPlugin.active).toBe(true);
      expect(globalPlugin.scope).toBe('global');

      const projectPlugin = plugins.find(p => p.name === 'project-plugin');
      expect(projectPlugin.active).toBe(false);
    });

    test('returns empty array when no plugins file exists', () => {
      fixture = createFixture('plugins-empty', () => {});
      scanner = loadScanner(fixture.claudeDir);
      expect(scanner.parsePlugins()).toEqual([]);
    });
  });

  describe('parseSettings', () => {
    test('returns settings object', () => {
      fixture = createFixture('settings', pluginFixture);
      scanner = loadScanner(fixture.claudeDir);
      const settings = scanner.parseSettings();
      expect(settings.enabledPlugins).toBeDefined();
    });

    test('returns empty object when settings file does not exist', () => {
      fixture = createFixture('settings-empty', () => {});
      scanner = loadScanner(fixture.claudeDir);
      expect(scanner.parseSettings()).toEqual({});
    });
  });

  describe('scanProjectDirs', () => {
    test('returns projects with CLAUDE.md and memory indicators', () => {
      fixture = createFixture('projects', (...args) => {
        sessionFixture(...args);
        memoryFixture(...args);
      });
      scanner = loadScanner(fixture.claudeDir);
      scanner.resetCache();
      const projects = scanner.scanProjectDirs();
      expect(projects.length).toBe(2);
      const proj = projects[0];
      expect(proj.key).toBeDefined();
      // Both projects have memory files from memoryFixture
      expect(proj.hasMemory).toBe(true);
      expect(proj.memCount).toBeGreaterThanOrEqual(1);
    });

    test('handles orphaned projects (no sessions)', () => {
      fixture = createFixture('orphaned', (...args) => {
        sessionFixture(...args);
        orphanedProjectFixture(...args);
      });
      scanner = loadScanner(fixture.claudeDir);
      scanner.resetCache();
      const projects = scanner.scanProjectDirs();
      const orphan = projects.find(p => p.key === '-home-testuser-orphan-project');
      expect(orphan).toBeDefined();
      // Without sessions, projectPath will be decoded from the key
      expect(orphan.path).toBeDefined();
    });

    test('caches results for 60 seconds', () => {
      fixture = createFixture('cache', sessionFixture);
      scanner = loadScanner(fixture.claudeDir);
      scanner.resetCache();
      const result1 = scanner.scanProjectDirs();
      const result2 = scanner.scanProjectDirs();
      expect(result1).toBe(result2); // same reference = cached
    });
  });

  describe('hyphen handling in project paths', () => {
    test('uses cwd from session metadata for projects with hyphens', () => {
      fixture = createFixture('hyphens', (...args) => {
        sessionFixture(...args);
        hyphenProjectFixture(...args);
      });
      scanner = loadScanner(fixture.claudeDir);
      scanner.resetCache();
      const sessions = scanner.parseSessions();
      const hyphenSession = sessions.find(s => s.sessionId === 'hyphen-123');
      expect(hyphenSession).toBeDefined();
      // The projectPath should come from cwd, not decoded key
      expect(hyphenSession.projectPath).toBe('/home/testuser/work/my-real-app');
      // It should NOT be the decoded (wrong) path
      expect(hyphenSession.projectPath).not.toBe('/home/testuser/work/my/real/app');
    });
  });

  describe('parseNotes', () => {
    let notes;

    beforeEach(() => {
      fixture = createFixture('notes', noteFixture);
      scanner = loadScanner(fixture.claudeDir);
      notes = scanner.parseNotes();
    });

    test('returns all note files', () => {
      expect(notes.length).toBe(3);
    });

    test('includes name, heading, date, tags, size, mtime, body', () => {
      for (const n of notes) {
        expect(typeof n.name).toBe('string');
        expect(typeof n.heading).toBe('string');
        expect(typeof n.date).toBe('string');
        expect(Array.isArray(n.tags)).toBe(true);
        expect(typeof n.size).toBe('number');
        expect(typeof n.mtime).toBe('string');
        expect(typeof n.body).toBe('string');
      }
    });

    test('strips quotes from the date field', () => {
      const n = notes.find(n => n.name === 'note-one.md');
      expect(n.date).toBe('2026-04-20 10:00');
      expect(n.date).not.toMatch(/^"/);
    });

    test('sorts by mtime descending', () => {
      expect(notes[0].mtime >= notes[1].mtime).toBe(true);
    });

    test('extracts ## style headings', () => {
      const n = notes.find(n => n.name === 'note-one.md');
      expect(n.heading).toBe('First note heading');
    });

    test('body excludes frontmatter block', () => {
      const n = notes.find(n => n.name === 'note-one.md');
      expect(n.body).toContain('Body content of note one');
      expect(n.body).not.toContain('date:');
    });

    test('returns empty array when notes dir does not exist', () => {
      fixture.cleanup();
      fixture = createFixture('notes-empty', () => {});
      scanner = loadScanner(fixture.claudeDir);
      expect(scanner.parseNotes()).toEqual([]);
    });
  });

  describe('getStats', () => {
    test('returns aggregate statistics', () => {
      fixture = createFixture('stats', (...args) => {
        sessionFixture(...args);
        planFixture(...args);
        memoryFixture(...args);
        todoFixture(...args);
        noteFixture(...args);
      });
      scanner = loadScanner(fixture.claudeDir);
      scanner.resetCache();
      const stats = scanner.getStats();
      expect(stats.conversations).toBe(2);
      expect(stats.plans).toBe(3);
      expect(stats.memories).toBe(3);
      expect(stats.todos).toBe(5);
      expect(stats.notes).toBe(3);
      expect(stats.recent.length).toBeLessThanOrEqual(10);
    });
  });

  describe('scanClaudeConfigs', () => {
    test('finds config files in the data dir', () => {
      fixture = createFixture('configs', (...args) => {
        sessionFixture(...args);
      });
      // Create a CLAUDE.md in the mock .claude dir
      fs.writeFileSync(path.join(fixture.claudeDir, 'CLAUDE.md'), '# Global config\n');
      scanner = loadScanner(fixture.claudeDir);
      const configs = scanner.scanClaudeConfigs();
      const global = configs.find(c => c.filePath === path.join(fixture.claudeDir, 'CLAUDE.md'));
      expect(global).toBeDefined();
      expect(global.scope).toBe('global');
    });

    test('scans up to 4 levels deep in project roots', () => {
      fixture = createFixture('configs-deep', () => {});
      // The scan root is fixture.claudeDir (tmpDir/.claude)
      // Create files at various depths relative to the scan root
      const l2Dir = path.join(fixture.claudeDir, 'level1', 'level2');
      const l5Dir = path.join(fixture.claudeDir, 'level1', 'level2', 'level3', 'level4', 'level5');
      fs.mkdirSync(l2Dir, { recursive: true });
      fs.mkdirSync(l5Dir, { recursive: true });
      fs.writeFileSync(path.join(l2Dir, 'CLAUDE.md'), '# L2\n');
      fs.writeFileSync(path.join(l5Dir, 'CLAUDE.md'), '# L5\n');

      scanner = loadScanner(fixture.claudeDir);
      const configs = scanner.scanClaudeConfigs();
      const l2 = configs.find(c => c.label.includes('level1/level2') && !c.label.includes('level5'));
      const l5 = configs.find(c => c.label.includes('level5'));
      expect(l2).toBeDefined();
      // level5 is at depth 5 from .claude, should be skipped (max depth 4)
      expect(l5).toBeUndefined();
    });

    test('skips noise directories', () => {
      fixture = createFixture('configs-skip', () => {});
      const nmDir = path.join(fixture.tmpDir, 'node_modules', 'some-pkg');
      fs.mkdirSync(nmDir, { recursive: true });
      fs.writeFileSync(path.join(nmDir, 'CLAUDE.md'), '# Should be skipped\n');

      scanner = loadScanner(fixture.claudeDir);
      const configs = scanner.scanClaudeConfigs();
      const nmConfig = configs.find(c => c.filePath.includes('node_modules'));
      expect(nmConfig).toBeUndefined();
    });
  });
});

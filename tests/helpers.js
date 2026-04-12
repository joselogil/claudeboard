const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Creates an isolated mock ~/.claude/ directory structure.
 * Returns { claudeDir, cleanup, fixture } where claudeDir is the path
 * to the mock .claude directory.
 */
function createFixture(name, structure) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `claudeboard-test-${name}-`));
  const claudeDir = path.join(tmpDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  function write(relPath, content) {
    const fullPath = path.join(claudeDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  function writeJson(relPath, obj) {
    write(relPath, JSON.stringify(obj, null, 2));
  }

  // Build the fixture
  if (structure) structure({ write, writeJson, claudeDir, tmpDir });

  return {
    claudeDir,
    tmpDir,
    cleanup() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/**
 * Creates a fixture with sample session files.
 */
function sessionFixture({ write, writeJson, claudeDir }) {
  // A realistic session JSONL file
  const sessionLines = [
    JSON.stringify({
      type: 'system',
      subtype: 'turn_duration',
      cwd: '/home/testuser/work/my-project',
      gitBranch: 'main',
      sessionId: 'abc-123',
      version: '0.1.0',
      slug: 'test-session-slug',
    }),
    JSON.stringify({
      type: 'user',
      message: { content: 'Hello, help me build a web app' },
      timestamp: '2025-01-15T10:00:00.000Z',
    }),
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Sure! Let me help you with that.' }] },
      timestamp: '2025-01-15T10:00:05.000Z',
    }),
    JSON.stringify({
      type: 'user',
      isMeta: true,
      message: { content: '<meta data>' },
      timestamp: '2025-01-15T10:00:06.000Z',
    }),
    JSON.stringify({
      type: 'user',
      message: { content: '<local-command ls>' },
      timestamp: '2025-01-15T10:00:07.000Z',
    }),
  ];

  write('projects/-home-testuser-work-my-project/abc-123.jsonl', sessionLines.join('\n'));

  // Second session in a different project
  const session2Lines = [
    JSON.stringify({
      type: 'system',
      subtype: 'turn_duration',
      cwd: '/home/testuser/personal/blog',
      gitBranch: 'feature/new-design',
      sessionId: 'def-456',
      version: '0.1.0',
      slug: 'blog-session',
    }),
    JSON.stringify({
      type: 'user',
      message: { content: 'Write a blog post about testing' },
      timestamp: '2025-01-16T14:00:00.000Z',
    }),
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Here is a draft blog post about testing strategies.' }] },
      timestamp: '2025-01-16T14:00:10.000Z',
    }),
  ];

  write('projects/-home-testuser-personal-blog/def-456.jsonl', session2Lines.join('\n'));
}

/**
 * Creates a fixture with plan files including tags.
 */
function planFixture({ write }) {
  write('plans/plan-one.md', `---
tags: ["work", "backend"]
---
# Plan One

Build the API endpoints.

## Steps
1. Design the API
2. Implement routes
3. Add tests
`);

  write('plans/plan-two.md', `---
tags: ["frontend", "work"]
---
# Plan Two

Style the dashboard.
`);

  write('plans/plan-three.md', `# Plan Three (no tags)

Just a plan without frontmatter.
`);
}

/**
 * Creates a fixture with memory files.
 */
function memoryFixture({ write }) {
  const memDir1 = 'projects/-home-testuser-work-my-project/memory';
  write(`${memDir1}/preferences.md`, `---
name: User Preferences
type: preference
description: User likes dark mode
---
The user prefers dark mode for all interfaces.
`);

  write(`${memDir1}/architecture.md`, `---
name: Architecture Notes
type: note
description: System uses microservices
---
The system is built with microservices pattern.
API gateway handles routing.
`);

  const memDir2 = 'projects/-home-testuser-personal-blog/memory';
  write(`${memDir2}/style-guide.md`, `---
name: Style Guide
type: reference
description: Blog style guide
---
Use serif fonts for body text.
`);
}

/**
 * Creates a fixture with todo files.
 */
function todoFixture({ writeJson }) {
  writeJson('todos/abc-123.json', [
    { content: 'Design API schema', status: 'completed' },
    { content: 'Implement auth middleware', status: 'in_progress' },
    { content: 'Write unit tests', status: 'pending' },
  ]);

  writeJson('todos/def-456.json', [
    { content: 'Outline blog post', status: 'completed' },
    { content: 'Add images', status: 'pending' },
  ]);
}

/**
 * Creates a fixture with plugin data.
 */
function pluginFixture({ writeJson }) {
  writeJson('plugins/installed_plugins.json', {
    plugins: {
      'my-plugin': {
        version: '1.0.0',
        scope: 'global',
        installedAt: '2025-01-01T00:00:00.000Z',
        installPath: '/tmp/test-plugins/my-plugin',
      },
      'project-plugin': [
        {
          version: '0.5.0',
          scope: 'project',
          installedAt: '2025-01-10T00:00:00.000Z',
          projectPath: '/home/testuser/work/my-project',
          installPath: '/tmp/test-plugins/project-plugin',
        },
      ],
    },
  });

  writeJson('settings.json', {
    enabledPlugins: {
      'my-plugin': true,
    },
  });
}

/**
 * Creates an orphaned project directory (no sessions).
 */
function orphanedProjectFixture({ write }) {
  write('projects/-home-testuser-orphan-project/.keep', '');
}

/**
 * Creates a project with real hyphens in the path.
 * e.g. cwd = /home/testuser/work/my-app (with real hyphen)
 * encoded as -home-testuser-work-my-app
 */
function hyphenProjectFixture({ write }) {
  const sessionLines = [
    JSON.stringify({
      type: 'system',
      subtype: 'turn_duration',
      cwd: '/home/testuser/work/my-real-app',
      gitBranch: 'main',
      sessionId: 'hyphen-123',
      version: '0.1.0',
      slug: 'hyphen-session',
    }),
    JSON.stringify({
      type: 'user',
      message: { content: 'Test session for hyphenated project' },
      timestamp: '2025-01-20T10:00:00.000Z',
    }),
  ];

  // The encoded key has hyphens but the real cwd has hyphens too
  write('projects/-home-testuser-work-my-real-app/hyphen-123.jsonl', sessionLines.join('\n'));
}

/**
 * Sets up a server test environment: creates a fixture, sets env vars,
 * clears the module cache, and requires the server fresh.
 * Returns { fixture, app, CLAUDE_DIR, TRASH_DIR }.
 *
 * extras: additional fixture builder functions (e.g. [pluginFixture])
 * Call teardownServer() in afterEach.
 */
function setupServer(name, extras = []) {
  const fixture = createFixture(name, (...args) => {
    sessionFixture(...args);
    planFixture(...args);
    memoryFixture(...args);
    for (const fn of extras) fn(...args);
  });

  const TRASH_DIR = fs.mkdtempSync(path.join(fixture.tmpDir, 'trash-'));

  process.env.CLAUDEBOARD_DATA_DIR = fixture.claudeDir;
  process.env.CLAUDEBOARD_TRASH_DIR = TRASH_DIR;

  // server and scanner read env vars at require-time; clear cache so each
  // test gets a fresh instance pointed at its own temp directory.
  delete require.cache[require.resolve('../server')];
  delete require.cache[require.resolve('../scanner')];

  const serverModule = require('../server');
  return { fixture, app: serverModule.createApp(), CLAUDE_DIR: serverModule.CLAUDE_DIR, TRASH_DIR };
}

/**
 * Tears down the server test environment created by setupServer().
 */
function teardownServer(fixture) {
  fixture.cleanup();
  delete process.env.CLAUDEBOARD_DATA_DIR;
  delete process.env.CLAUDEBOARD_TRASH_DIR;
  delete require.cache[require.resolve('../server')];
  delete require.cache[require.resolve('../scanner')];
}

module.exports = {
  createFixture,
  sessionFixture,
  planFixture,
  memoryFixture,
  todoFixture,
  pluginFixture,
  orphanedProjectFixture,
  hyphenProjectFixture,
  setupServer,
  teardownServer,
};

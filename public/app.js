// Claude Dashboard — frontend app

const path = { basename: s => s.split('/').pop() };

const api = {
  async get(endpoint) {
    const r = await fetch('/api' + endpoint);
    if (!r.ok) throw new Error(`GET ${endpoint} failed: ${r.status}`);
    return r.json();
  },
  async post(endpoint, body) {
    const r = await fetch('/api' + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error(`POST ${endpoint} failed: ${r.status}`);
    return r.json();
  },
  async delete(endpoint) {
    const r = await fetch('/api' + endpoint, { method: 'DELETE' });
    if (!r.ok) throw new Error(`DELETE ${endpoint} failed: ${r.status}`);
    return r.json();
  },
};

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function shortDate(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

let _homedir = null;

function shortProject(p) {
  if (!p) return '—';
  if (_homedir) {
    if (p === _homedir) return '~';
    if (p.startsWith(_homedir + '/')) return '~/' + p.slice(_homedir.length + 1);
    if (p.startsWith(_homedir + '\\')) return '~/' + p.slice(_homedir.length + 1);
  }
  // Fallback for Linux/macOS if meta hasn't loaded yet
  return p.replace(/^\/home\/[^/]+\//, '~/').replace(/^\/home\/[^/]+$/, '~')
          .replace(/^\/Users\/[^/]+\//, '~/').replace(/^\/Users\/[^/]+$/, '~');
}

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function renderMd(md) {
  if (typeof marked === 'undefined') return `<pre>${escHtml(md)}</pre>`;
  return marked.parse(md).replace(/<(script|iframe)[\s\S]*?<\/\1>/gi, '');
}

function errorHtml(msg) {
  return `<div class="empty error-msg">Error: ${escHtml(msg)}</div>`;
}

function showError(container, msg) {
  container.innerHTML = errorHtml(msg);
}

// Modal
const overlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
document.getElementById('modal-close').onclick = closeModal;
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function openModal(html) {
  modalContent.innerHTML = html;
  overlay.classList.add('open');
}

function closeModal() {
  overlay.classList.remove('open');
  modalContent.innerHTML = '';
}

// Routing
const views = {};
let currentView = null;

function navigate(viewName) {
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.view === viewName);
  });
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="loading">Loading...</div>';
  currentView = viewName;
  (views[viewName] || views.overview)(container);
}

document.querySelectorAll('.nav-link').forEach(a => {
  a.addEventListener('click', () => navigate(a.dataset.view));
});


// Load server meta (homedir) once for portable path display
api.get('/meta').then(meta => { _homedir = meta.homedir || null; });

function updateSidebarCounts(stats) {
  document.getElementById('cnt-sessions').textContent = stats.conversations.toLocaleString();
  document.getElementById('cnt-plans').textContent = stats.plans;
  document.getElementById('cnt-notes').textContent = stats.notes || '';
  document.getElementById('cnt-memories').textContent = stats.memories;
  document.getElementById('cnt-tasks').textContent = stats.todos.toLocaleString();
  document.getElementById('cnt-plugins').textContent = stats.plugins;
  document.getElementById('cnt-projects').textContent = stats.projects;
  window._stats = stats;
}

// Load stats once and update sidebar counts
api.get('/stats').then(updateSidebarCounts);

async function refreshSidebarStats() {
  try { updateSidebarCounts(await api.get('/stats')); } catch {}
}

// ── Views ──────────────────────────────────────────────────────────

views.overview = async function(container) {
  try {
    const [stats, plans] = await Promise.all([
      window._stats || api.get('/stats'),
      api.get('/plans?limit=10'),
    ]);
  window._stats = stats;

  const cards = [
    { label: 'Sessions', value: stats.conversations.toLocaleString(), view: 'sessions' },
    { label: 'Plans', value: stats.plans, view: 'plans' },
    { label: 'Memories', value: stats.memories, view: 'memories' },
    { label: 'Tasks', value: stats.todos.toLocaleString(), view: 'tasks' },
    { label: 'Projects', value: stats.projects, view: 'projects' },
    { label: 'Plugins', value: stats.plugins, view: 'plugins' },
  ];

  container.innerHTML = `
    <div class="section-header">
      <h2>Overview</h2>
      <p>Local data at a glance</p>
    </div>
    <div class="stats-grid">
      ${cards.map(c => `
        <a class="stat-card" href="#${c.view}" data-view="${c.view}">
          <div class="value">${c.value}</div>
          <div class="label">${c.label}</div>
        </a>
      `).join('')}
    </div>
    <div class="overview-columns">
      <div class="overview-col">
        <div class="section-header">
          <h2>Latest Plans</h2>
          <p>${plans.length} plans</p>
        </div>
        <div class="timeline">
          ${plans.map(p => `
            <div class="timeline-item" data-plan-name="${escHtml(p.name)}">
              <div class="timeline-time">${shortDate(p.mtime)}</div>
              <div>
                <div class="timeline-text">${escHtml(p.heading)}</div>
                <div class="timeline-project mono">${escHtml(p.tags.join(', ') || p.name)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="overview-col">
        <div class="section-header">
          <h2>Recent Sessions</h2>
          <p>${stats.recent.length} sessions</p>
        </div>
        <div class="timeline">
          ${(stats.recent || []).map(s => `
            <div class="timeline-item" data-project="${escHtml(s.project)}" data-session-id="${escHtml(s.sessionId)}">
              <div class="timeline-time">${shortDate(s.lastTs)}</div>
              <div>
                <div class="timeline-text">${escHtml(s.firstMessage)}</div>
                <div class="timeline-project mono">${shortProject(s.projectPath)}${s.meta.gitBranch ? ' · ' + escHtml(s.meta.gitBranch) : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('.timeline-item[data-plan-name]').forEach(item => {
    item.addEventListener('click', () => openPlanModal(item.dataset.planName));
  });

  container.querySelectorAll('.timeline-item[data-session-id]').forEach(item => {
    item.addEventListener('click', () => openSessionModal(item.dataset.project, item.dataset.sessionId));
  });
  } catch (err) {
    showError(container, err.message);
  }
};

// Conversations (real session browser)
let convState = { q: '', offset: 0, limit: 50 };

views.sessions = async function(container) {
  convState.q = '';
  convState.offset = 0;
  await renderConversations(container);
};

async function renderConversations(container) {
  try {
    const params = new URLSearchParams({ q: convState.q, offset: convState.offset, limit: convState.limit });
    const data = await api.get('/conversations?' + params);
    const pageNum = Math.floor(convState.offset / convState.limit) + 1;
    const totalPages = Math.ceil(data.total / convState.limit);

  container.innerHTML = `
    <div class="section-header">
      <h2>Sessions</h2>
      <p>${data.total} sessions across all projects</p>
    </div>
    <div class="search-bar">
      <input type="text" id="conv-search" placeholder="Search by message, project, branch..." value="${escHtml(convState.q)}">
      <button id="conv-search-btn">Search</button>
      <button id="conv-clear-btn">Clear</button>
    </div>
    <div class="session-list">
      ${data.items.map(s => `
        <div class="session-item" data-project="${escHtml(s.project)}" data-session-id="${escHtml(s.sessionId)}">
          <div class="session-item-header">
            <div class="session-first-msg">${escHtml(s.firstMessage)}</div>
            <button class="btn-delete btn-delete-session" title="Move to trash">Trash</button>
          </div>
          <div class="session-meta">
            <span class="mono">${shortProject(s.projectPath)}</span>
            ${s.meta.gitBranch ? `<span class="session-branch">${escHtml(s.meta.gitBranch)}</span>` : ''}
            <span class="session-date">${formatDate(s.lastTs)}</span>
            <span class="session-count">${s.messageCount} messages</span>
            <button class="btn-resume" data-session-id="${escHtml(s.sessionId)}" data-project-path="${escHtml(s.projectPath || '')}" title="Copy: cd &lt;project&gt; &amp;&amp; claude --resume &lt;id&gt;">Resume</button>
            <button class="btn-copy-slash btn-slash-card" data-session-id="${escHtml(s.sessionId)}" title="Copy: /resume &lt;id&gt; (paste into active Claude session)">In Claude</button>
          </div>
        </div>
      `).join('') || '<div class="empty">No sessions found</div>'}
    </div>
    <div class="pagination">
      <button id="conv-prev" ${convState.offset === 0 ? 'disabled' : ''}>Previous</button>
      <span class="page-info">Page ${pageNum} of ${totalPages || 1}</span>
      <button id="conv-next" ${convState.offset + convState.limit >= data.total ? 'disabled' : ''}>Next</button>
    </div>
  `;

  document.getElementById('conv-search-btn').onclick = () => {
    convState.q = document.getElementById('conv-search').value;
    convState.offset = 0;
    renderConversations(container);
  };
  document.getElementById('conv-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('conv-search-btn').click();
  });
  document.getElementById('conv-clear-btn').onclick = () => {
    convState.q = '';
    convState.offset = 0;
    renderConversations(container);
  };
  document.getElementById('conv-prev').onclick = () => {
    convState.offset = Math.max(0, convState.offset - convState.limit);
    renderConversations(container);
  };
  document.getElementById('conv-next').onclick = () => {
    convState.offset += convState.limit;
    renderConversations(container);
  };

  container.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-resume') || e.target.closest('.btn-delete-session')) return;
      openSessionModal(item.dataset.project, item.dataset.sessionId);
    });
  });

  container.querySelectorAll('.btn-resume').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyResume(btn.dataset.sessionId, btn, btn.dataset.projectPath || null);
    });
  });

  container.querySelectorAll('.btn-slash-card').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(`/resume ${btn.dataset.sessionId}`, btn);
    });
  });

  container.querySelectorAll('.btn-delete-session').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.session-item');
      const { project, sessionId } = item.dataset;
      const result = await api.delete(`/conversations/${encodeURIComponent(project)}/${encodeURIComponent(sessionId)}`);
      if (result.ok) {
        item.remove();
        await refreshSidebarStats();
      } else {
        alert('Failed: ' + (result.error || 'unknown error'));
      }
    });
  });
  } catch (err) {
    showError(container, err.message);
  }
}

async function openPlanModal(name) {
  try {
    openModal('<div class="loading">Loading plan...</div>');
    const plan = await api.get('/plans/' + encodeURIComponent(name));
  openModal(`
    <div class="conv-modal-header">
      <div>
        <h3>${escHtml(plan.heading)}</h3>
        <p class="modal-sub">${escHtml(plan.name)} · ${fmtBytes(plan.size)} · Modified ${formatDate(plan.mtime)}</p>
      </div>
      <div class="plan-cmd-block">
        <div class="conv-resume-block">
          <code class="resume-cmd">load ~/.claude/plans/${escHtml(plan.name)}</code>
          <button class="btn-plan-cmd btn-copy-cmd" data-cmd="load" data-name="${escHtml(plan.name)}">Copy</button>
        </div>
        <div class="conv-resume-block">
          <code class="resume-cmd">execute ~/.claude/plans/${escHtml(plan.name)}</code>
          <button class="btn-plan-cmd btn-copy-cmd" data-cmd="execute" data-name="${escHtml(plan.name)}">Copy</button>
        </div>
      </div>
    </div>
    <div class="md-content">${renderMd(plan.body)}</div>
  `);
  document.querySelectorAll('.btn-plan-cmd').forEach(btn => {
    btn.addEventListener('click', () => {
      copyText(`${btn.dataset.cmd} ~/.claude/plans/${btn.dataset.name}`, btn);
    });
  });
  } catch (err) {
    openModal(errorHtml(err.message));
  }
}

function copyText(text, triggerEl) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = triggerEl.textContent;
    triggerEl.textContent = 'Copied!';
    setTimeout(() => triggerEl.textContent = orig, 1500);
  });
}

function copyResume(sessionId, triggerEl, projectPath) {
  const prefix = projectPath ? `cd ${projectPath} && ` : '';
  copyText(`${prefix}claude --resume ${sessionId}`, triggerEl);
}

async function openSessionModal(project, sessionId) {
  try {
    openModal('<div class="loading">Loading conversation...</div>');
    const data = await api.get(`/conversations/${encodeURIComponent(project)}/${encodeURIComponent(sessionId)}`);
    const { messages, projectPath } = data;
    const displayPath = projectPath
      ? shortProject(projectPath)
      : `path unknown (${escHtml(project)})`;

    const html = `
      <div class="conv-modal-header">
        <h3>${escHtml(messages[0]?.text?.slice(0, 80) || sessionId)}</h3>
        <p class="modal-sub">${messages.length} messages · <span class="mono">${escHtml(displayPath)}</span></p>
        <div class="conv-resume-block">
          <button class="btn-copy-cmd" data-session-id="${escHtml(sessionId)}" title="Copy: cd &lt;project&gt; &amp;&amp; claude --resume &lt;id&gt;">Resume</button>
          <button class="btn-copy-slash" data-session-id="${escHtml(sessionId)}" title="Copy: /resume &lt;id&gt; (paste into active Claude session)">In Claude</button>
          <button class="btn-delete btn-delete-modal-session" title="Move to trash">Trash</button>
        </div>
      </div>
      <div class="conv-thread">
        ${messages.map(m => `
          <div class="conv-msg conv-msg-${m.role}">
            <div class="conv-msg-role">${m.role}</div>
            <div class="conv-msg-text">${escHtml(m.text)}</div>
            ${m.ts ? `<div class="conv-msg-ts">${formatDate(m.ts)}</div>` : ''}
          </div>
        `).join('') || '<div class="empty">No messages</div>'}
      </div>
    `;
    openModal(html);

    modalContent.querySelector('.btn-copy-cmd[data-session-id]').addEventListener('click', (e) => {
      copyResume(e.target.dataset.sessionId, e.target, projectPath);
    });

    modalContent.querySelector('.btn-copy-slash[data-session-id]').addEventListener('click', (e) => {
      copyText(`/resume ${e.target.dataset.sessionId}`, e.target);
    });

    modalContent.querySelector('.btn-delete-modal-session').addEventListener('click', async () => {
      const result = await api.delete(`/conversations/${encodeURIComponent(project)}/${encodeURIComponent(sessionId)}`);
      if (result.ok) {
        closeModal();
        document.querySelector(`.session-item[data-session-id="${sessionId}"]`)?.remove();
        await refreshSidebarStats();
      } else {
        alert('Failed: ' + (result.error || 'unknown error'));
      }
    });
  } catch (err) {
    openModal(errorHtml(err.message));
  }
}

// Plans view
let planQ = '';
let planTag = '';

views.plans = async function(container) {
  planQ = '';
  planTag = '';
  await renderPlans(container);
};

function renderTagChips(tags, planName) {
  if (!tags || tags.length === 0) return `<span class="tag-add-hint">+ add tags</span>`;
  return tags.map(t => `<span class="plan-tag" data-tag="${escHtml(t)}">${escHtml(t)}</span>`).join('') +
    `<span class="tag-add-hint">+</span>`;
}

async function renderPlans(container) {
  try {
    const allTags = await api.get('/plans/tags');
    const params = new URLSearchParams();
    if (planQ) params.set('q', planQ);
    if (planTag) params.set('tag', planTag);
    const qs = params.toString();
    const plans = await api.get('/plans' + (qs ? '?' + qs : ''));

  const tagFilterHtml = allTags.length > 0 ? `
    <div class="tag-filter-bar">
      <span class="tag-filter-label">Filter:</span>
      <button class="tag-filter-chip ${!planTag ? 'active' : ''}" data-filter-tag="">All</button>
      ${allTags.map(({ tag, count }) => `
        <button class="tag-filter-chip ${planTag === tag ? 'active' : ''}" data-filter-tag="${escHtml(tag)}">
          ${escHtml(tag)} <span class="tag-count">${count}</span>
        </button>
      `).join('')}
    </div>
  ` : '';

  container.innerHTML = `
    <div class="section-header">
      <h2>Plans</h2>
      <p>${plans.length} plan${plans.length !== 1 ? 's' : ''}${planQ ? ' matching "' + escHtml(planQ) + '"' : ''}${planTag ? ' tagged "' + escHtml(planTag) + '"' : ''}</p>
    </div>
    <div class="search-bar">
      <input type="text" id="plans-search" placeholder="Search title, content, tags..." value="${escHtml(planQ)}">
      <button id="plans-search-btn">Search</button>
      <button id="plans-clear-btn">Clear</button>
    </div>
    ${tagFilterHtml}
    <div class="plans-grid">
      ${plans.map(p => `
        <div class="plan-card" data-name="${escHtml(p.name)}">
          <div class="plan-card-header">
            <div>
              <div class="plan-name">${escHtml(p.name)}</div>
              <div class="plan-heading">${escHtml(p.heading)}</div>
            </div>
            <button class="btn-delete" data-delete-plan="${escHtml(p.name)}" title="Move to trash">Trash</button>
          </div>
          <div class="plan-tags" data-plan-name="${escHtml(p.name)}" data-tags="${escHtml(JSON.stringify(p.tags))}">
            ${renderTagChips(p.tags, p.name)}
          </div>
          <div class="plan-footer">
            <span class="plan-meta">${fmtBytes(p.size)} · ${shortDate(p.mtime)}</span>
            <div class="plan-footer-btns">
              <button class="btn-load-plan" data-plan-name="${escHtml(p.name)}" data-cmd="load" title="Copy load command">Load</button>
              <button class="btn-load-plan" data-plan-name="${escHtml(p.name)}" data-cmd="execute" title="Copy execute command">Execute</button>
            </div>
          </div>
        </div>
      `).join('') || '<div class="empty">No plans match</div>'}
    </div>
  `;

  // Search
  document.getElementById('plans-search-btn').onclick = () => {
    planQ = document.getElementById('plans-search').value.trim();
    renderPlans(container);
  };
  document.getElementById('plans-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('plans-search-btn').click();
  });
  document.getElementById('plans-clear-btn').onclick = () => {
    planQ = '';
    planTag = '';
    renderPlans(container);
  };

  // Tag filter chips
  container.querySelectorAll('[data-filter-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      planTag = btn.dataset.filterTag;
      renderPlans(container);
    });
  });

  // Plan card clicks
  container.querySelectorAll('.plan-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete') || e.target.closest('.plan-tags')) return;
      openPlanModal(card.dataset.name);
    });
  });

  // Trash button
  container.querySelectorAll('[data-delete-plan]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = btn.dataset.deletePlan;
      const result = await api.delete('/plans/' + encodeURIComponent(name));
      if (result.ok) {
        btn.closest('.plan-card').remove();
        await refreshSidebarStats();
      } else {
        alert('Failed: ' + (result.error || 'unknown error'));
      }
    });
  });

  // Load button — copy execute command
  container.querySelectorAll('.btn-load-plan').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(`${btn.dataset.cmd} ~/.claude/plans/${btn.dataset.planName}`, btn);
    });
  });

  // Tag editing — click on tag area to open editor
  container.querySelectorAll('.plan-tags').forEach(tagArea => {
    tagArea.addEventListener('click', (e) => {
      e.stopPropagation();
      openTagEditor(tagArea);
    });
  });
  } catch (err) {
    showError(container, err.message);
  }
}

function openTagEditor(tagArea) {
  const planName = tagArea.dataset.planName;
  const currentTags = JSON.parse(tagArea.dataset.tags || '[]');

  const editor = document.createElement('div');
  editor.className = 'tag-editor';
  editor.innerHTML = `
    <div class="tag-editor-chips">
      ${currentTags.map(t => `<span class="tag-editor-chip">${escHtml(t)}<button class="tag-remove" data-tag="${escHtml(t)}">&times;</button></span>`).join('')}
    </div>
    <input class="tag-editor-input" type="text" placeholder="add tag, press Enter" autocomplete="off">
    <div class="tag-editor-actions">
      <button class="tag-save-btn">Save</button>
      <button class="tag-cancel-btn">Cancel</button>
    </div>
  `;

  // Replace tag area content with editor
  tagArea.innerHTML = '';
  tagArea.appendChild(editor);

  const input = editor.querySelector('.tag-editor-input');
  const chips = editor.querySelector('.tag-editor-chips');
  let tags = [...currentTags];

  function refreshChips() {
    chips.innerHTML = tags.map(t =>
      `<span class="tag-editor-chip">${escHtml(t)}<button class="tag-remove" data-tag="${escHtml(t)}">&times;</button></span>`
    ).join('');
    chips.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        tags = tags.filter(t => t !== btn.dataset.tag);
        refreshChips();
      });
    });
  }
  refreshChips();

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (val && !tags.includes(val)) {
        tags.push(val);
        refreshChips();
      }
      input.value = '';
    }
    if (e.key === 'Escape') editor.querySelector('.tag-cancel-btn').click();
  });

  editor.querySelector('.tag-save-btn').addEventListener('click', async () => {
    const r = await fetch('/api/plans/' + encodeURIComponent(planName) + '/tags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
    const result = await r.json();
    if (result.ok) {
      tagArea.dataset.tags = JSON.stringify(result.tags);
      tagArea.innerHTML = renderTagChips(result.tags, planName);
      tagArea.onclick = (e) => { e.stopPropagation(); openTagEditor(tagArea); };
    } else {
      alert('Save failed: ' + result.error);
    }
  });

  editor.querySelector('.tag-cancel-btn').addEventListener('click', () => {
    tagArea.innerHTML = renderTagChips(currentTags, planName);
    tagArea.onclick = (e) => { e.stopPropagation(); openTagEditor(tagArea, container); };
  });

  input.focus();
}

// Notes view
let noteQ = '';
let noteTag = '';

views.notes = async function(container) {
  noteQ = '';
  noteTag = '';
  await renderNotes(container);
};

async function renderNotes(container) {
  try {
    const allTags = await api.get('/notes/tags');
    const params = new URLSearchParams();
    if (noteQ) params.set('q', noteQ);
    if (noteTag) params.set('tag', noteTag);
    const qs = params.toString();
    const notes = await api.get('/notes' + (qs ? '?' + qs : ''));

    const tagFilterHtml = allTags.length > 0 ? `
      <div class="tag-filter-bar">
        <span class="tag-filter-label">Filter:</span>
        <button class="tag-filter-chip ${!noteTag ? 'active' : ''}" data-filter-tag="">All</button>
        ${allTags.map(({ tag, count }) => `
          <button class="tag-filter-chip ${noteTag === tag ? 'active' : ''}" data-filter-tag="${escHtml(tag)}">
            ${escHtml(tag)} <span class="tag-count">${count}</span>
          </button>
        `).join('')}
      </div>
    ` : '';

    container.innerHTML = `
      <div class="section-header">
        <h2>Notes</h2>
        <p>${notes.length} note${notes.length !== 1 ? 's' : ''}${noteQ ? ' matching "' + escHtml(noteQ) + '"' : ''}${noteTag ? ' tagged "' + escHtml(noteTag) + '"' : ''}</p>
      </div>
      <div class="search-bar">
        <input type="text" id="notes-search" placeholder="Search title, content, tags..." value="${escHtml(noteQ)}">
        <button id="notes-search-btn">Search</button>
        <button id="notes-clear-btn">Clear</button>
      </div>
      ${tagFilterHtml}
      <div class="plans-grid">
        ${notes.map(n => `
          <div class="plan-card" data-name="${escHtml(n.name)}">
            <div class="plan-card-header">
              <div>
                <div class="plan-name">${escHtml(n.name)}</div>
                <div class="plan-heading">${escHtml(n.heading)}</div>
              </div>
              <button class="btn-delete" data-delete-note="${escHtml(n.name)}" title="Move to trash">Trash</button>
            </div>
            <div class="plan-tags" data-note-name="${escHtml(n.name)}" data-tags="${escHtml(JSON.stringify(n.tags))}">
              ${renderTagChips(n.tags, n.name)}
            </div>
            <div class="plan-footer">
              <span class="plan-meta">${fmtBytes(n.size)} · ${n.date || shortDate(n.mtime)}</span>
              <div class="plan-footer-btns">
                <button class="btn-load-plan btn-copy-note-path-card" data-note-path="~/.claude/notes/${escHtml(n.name)}" title="Copy path">Copy path</button>
                <button class="btn-note-promote ${n.promoted ? 'note-promoted' : ''}"
                        data-note-name="${escHtml(n.name)}"
                        title="${n.promoted ? 'Unpin note' : 'Pin note'}">
                  ${n.promoted ? 'Pinned' : 'Pin'}
                </button>
              </div>
            </div>
          </div>
        `).join('') || '<div class="empty">No notes found</div>'}
      </div>
    `;

    document.getElementById('notes-search-btn').onclick = () => {
      noteQ = document.getElementById('notes-search').value.trim();
      renderNotes(container);
    };
    document.getElementById('notes-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('notes-search-btn').click();
    });
    document.getElementById('notes-clear-btn').onclick = () => {
      noteQ = '';
      noteTag = '';
      renderNotes(container);
    };

    container.querySelectorAll('[data-filter-tag]').forEach(btn => {
      btn.addEventListener('click', () => {
        noteTag = btn.dataset.filterTag;
        renderNotes(container);
      });
    });

    container.querySelectorAll('.plan-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.btn-delete') || e.target.closest('.btn-note-promote') || e.target.closest('.plan-tags')) return;
        openNoteModal(card.dataset.name);
      });
    });

    container.querySelectorAll('[data-delete-note]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const name = btn.dataset.deleteNote;
        const result = await api.delete('/notes/' + encodeURIComponent(name));
        if (result.ok) {
          btn.closest('.plan-card').remove();
          await refreshSidebarStats();
        } else {
          alert('Failed: ' + (result.error || 'unknown error'));
        }
      });
    });

    container.querySelectorAll('.btn-copy-note-path-card').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        copyText(btn.dataset.notePath, btn);
      });
    });

    container.querySelectorAll('.btn-note-promote').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const name = btn.dataset.noteName;
        const r = await fetch('/api/notes/' + encodeURIComponent(name) + '/promote', { method: 'PATCH' });
        const result = await r.json();
        if (result.ok) {
          await renderNotes(container);
        } else {
          alert('Pin failed: ' + (result.error || 'unknown error'));
        }
      });
    });

    container.querySelectorAll('.plan-tags[data-note-name]').forEach(tagArea => {
      tagArea.addEventListener('click', e => {
        e.stopPropagation();
        openNoteTagEditor(tagArea, container);
      });
    });
  } catch (err) {
    showError(container, err.message);
  }
}

function openNoteTagEditor(tagArea, container) {
  const noteName = tagArea.dataset.noteName;
  const currentTags = JSON.parse(tagArea.dataset.tags || '[]');

  const editor = document.createElement('div');
  editor.className = 'tag-editor';
  editor.innerHTML = `
    <div class="tag-editor-chips">
      ${currentTags.map(t => `<span class="tag-editor-chip">${escHtml(t)}<button class="tag-remove" data-tag="${escHtml(t)}">&times;</button></span>`).join('')}
    </div>
    <input class="tag-editor-input" type="text" placeholder="add tag, press Enter" autocomplete="off">
    <div class="tag-editor-actions">
      <button class="tag-save-btn">Save</button>
      <button class="tag-cancel-btn">Cancel</button>
    </div>
  `;

  tagArea.innerHTML = '';
  tagArea.appendChild(editor);

  const input = editor.querySelector('.tag-editor-input');
  const chips = editor.querySelector('.tag-editor-chips');
  let tags = [...currentTags];

  function refreshChips() {
    chips.innerHTML = tags.map(t =>
      `<span class="tag-editor-chip">${escHtml(t)}<button class="tag-remove" data-tag="${escHtml(t)}">&times;</button></span>`
    ).join('');
    chips.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        tags = tags.filter(t => t !== btn.dataset.tag);
        refreshChips();
      });
    });
  }
  refreshChips();

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (val && !tags.includes(val)) { tags.push(val); refreshChips(); }
      input.value = '';
    }
    if (e.key === 'Escape') editor.querySelector('.tag-cancel-btn').click();
  });

  editor.querySelector('.tag-save-btn').addEventListener('click', async () => {
    const r = await fetch('/api/notes/' + encodeURIComponent(noteName) + '/tags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
    const result = await r.json();
    if (result.ok) {
      tagArea.dataset.tags = JSON.stringify(result.tags);
      tagArea.innerHTML = renderTagChips(result.tags, noteName);
      tagArea.onclick = e => { e.stopPropagation(); openNoteTagEditor(tagArea, container); };
    } else {
      alert('Save failed: ' + result.error);
    }
  });

  editor.querySelector('.tag-cancel-btn').addEventListener('click', () => {
    tagArea.innerHTML = renderTagChips(currentTags, noteName);
    tagArea.onclick = e => { e.stopPropagation(); openNoteTagEditor(tagArea, container); };
  });

  input.focus();
}

async function openNoteModal(name) {
  try {
    openModal('<div class="loading">Loading note...</div>');
    const note = await api.get('/notes/' + encodeURIComponent(name));
    const notePath = `~/.claude/notes/${note.name}`;
    openModal(`
      <div class="conv-modal-header">
        <div>
          <h3>${escHtml(note.heading)}</h3>
          <p class="modal-sub">${escHtml(note.name)} · ${fmtBytes(note.size)} · ${note.date || shortDate(note.mtime)}</p>
          ${note.tags.length > 0 ? `<div class="modal-tags">${note.tags.map(t => `<span class="plan-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="conv-resume-block">
          <code class="resume-cmd">${escHtml(notePath)}</code>
          <button class="btn-copy-note-path btn-copy-cmd" title="Copy path to paste into Claude">Copy path</button>
          <button class="btn-note-promote-modal ${note.promoted ? 'note-promoted' : ''}"
                  title="${note.promoted ? 'Unpin note' : 'Pin note'}">
            ${note.promoted ? 'Pinned' : 'Pin'}
          </button>
          <button class="btn-delete btn-delete-note-modal" title="Move to trash">Trash</button>
        </div>
      </div>
      <div class="md-content">${renderMd(note.body)}</div>
    `);

    modalContent.querySelector('.btn-copy-note-path').addEventListener('click', e => {
      copyText(notePath, e.target);
    });

    modalContent.querySelector('.btn-note-promote-modal').addEventListener('click', async () => {
      const el = modalContent.querySelector('.btn-note-promote-modal');
      const r = await fetch('/api/notes/' + encodeURIComponent(name) + '/promote', { method: 'PATCH' });
      const result = await r.json();
      if (result.ok) {
        el.textContent = result.promoted ? 'Pinned' : 'Pin';
        el.classList.toggle('note-promoted', result.promoted);
        el.title = result.promoted ? 'Unpin note' : 'Pin note';
      }
    });

    modalContent.querySelector('.btn-delete-note-modal').addEventListener('click', async () => {
      const result = await api.delete('/notes/' + encodeURIComponent(name));
      if (result.ok) {
        closeModal();
        document.querySelector(`.plan-card[data-name="${CSS.escape(name)}"]`)?.remove();
        await refreshSidebarStats();
      } else {
        alert('Failed: ' + (result.error || 'unknown error'));
      }
    });
  } catch (err) {
    openModal(errorHtml(err.message));
  }
}

// Memories view
let memoryQ = '';

views.memories = async function(container) {
  memoryQ = '';
  await renderMemories(container);
};

async function renderMemories(container) {
  try {
    const params = memoryQ ? '?q=' + encodeURIComponent(memoryQ) : '';
    const memories = await api.get('/memories' + params);

  const byProject = {};
  for (const m of memories) {
    (byProject[m.project] = byProject[m.project] || []).push(m);
  }

  let html = `
    <div class="section-header">
      <h2>Memories</h2>
      <p>${memories.length} memor${memories.length !== 1 ? 'ies' : 'y'}${memoryQ ? ' matching "' + escHtml(memoryQ) + '"' : ' across ' + Object.keys(byProject).length + ' projects'}</p>
    </div>
    <div class="search-bar">
      <input type="text" id="memories-search" placeholder="Search name, description, and content..." value="${escHtml(memoryQ)}">
      <button id="memories-search-btn">Search</button>
      <button id="memories-clear-btn">Clear</button>
    </div>
    ${memories.length === 0 ? '<div class="empty">No memories match your search</div>' : ''}
  `;

  html += '<div class="memories-grid">';
  for (const [proj, mems] of Object.entries(byProject)) {
    const displayPath = mems[0].projectPath ? shortProject(mems[0].projectPath) : escHtml(proj);
    html += `<div class="memories-group-header">${displayPath}</div>`;
    for (const m of mems) {
      const tagCls = `tag tag-${m.type}`;
      html += `
        <div class="card-item" data-project="${escHtml(m.project)}" data-file="${escHtml(m.file)}" data-name="${escHtml(m.name)}" data-type="${escHtml(m.type)}" data-description="${escHtml(m.description)}" data-body="${escHtml(m.body)}">
          <div class="card-item-header">
            <div class="title">
              ${escHtml(m.name)}
              &nbsp;<span class="${tagCls}">${escHtml(m.type)}</span>
            </div>
            <button class="btn-delete" title="Move to trash">Trash</button>
          </div>
          <div class="meta">${escHtml(m.description)}</div>
        </div>
      `;
    }
  }
  html += '</div>';

  container.innerHTML = html;

  document.getElementById('memories-search-btn').onclick = () => {
    memoryQ = document.getElementById('memories-search').value.trim();
    renderMemories(container);
  };
  document.getElementById('memories-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('memories-search-btn').click();
  });
  document.getElementById('memories-clear-btn').onclick = () => {
    memoryQ = '';
    renderMemories(container);
  };

  container.querySelectorAll('.card-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete')) return;
      const { name, type, description, body } = item.dataset;
      const tagCls = `tag tag-${escHtml(type)}`;
      openModal(`
        <div class="memory-modal-header">
          <h3>${escHtml(name)} <span class="${tagCls}">${escHtml(type)}</span></h3>
          ${description ? `<p class="modal-sub">${escHtml(description)}</p>` : ''}
        </div>
        <div class="memory-modal-body">${renderMd(body)}</div>
      `);
    });

    item.querySelector('.btn-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const { project, file } = item.dataset;
      const result = await api.delete(`/memories/${encodeURIComponent(project)}/${encodeURIComponent(file)}`);
      if (result.ok) {
        item.remove();
        await refreshSidebarStats();
      } else {
        alert('Failed: ' + (result.error || 'unknown error'));
      }
    });
  });
  } catch (err) {
    showError(container, err.message);
  }
}

// Todos view
views.tasks = async function(container) {
  try {
  const groups = await api.get('/todos');
  const nonEmpty = groups.filter(g => g.items.length > 0);

  if (nonEmpty.length === 0) {
    container.innerHTML = `
      <div class="section-header"><h2>Tasks</h2></div>
      <div class="empty">No tasks found</div>
    `;
    return;
  }

  let html = `
    <div class="section-header">
      <h2>Tasks</h2>
      <p>${nonEmpty.reduce((s, g) => s + g.items.length, 0).toLocaleString()} items across ${nonEmpty.length} sessions</p>
    </div>
  `;

  for (const group of nonEmpty) {
    html += `<div class="group-header mono">${escHtml(group.sessionId.slice(0, 36))}</div>`;
    html += '<div class="card-list">';
    for (const item of group.items.slice(0, 20)) {
      const status = item.status || item.state || 'unknown';
      html += `
        <div class="card-item">
          <div class="title">${escHtml(item.content || item.title || item.text || JSON.stringify(item).slice(0, 80))}</div>
          <div class="meta">Status: ${escHtml(status)}</div>
        </div>
      `;
    }
    if (group.items.length > 20) {
      html += `<div class="card-item"><div class="meta">+ ${group.items.length - 20} more items</div></div>`;
    }
    html += '</div>';
  }

  container.innerHTML = html;
  } catch (err) {
    showError(container, err.message);
  }
};

// Plugins view
let pluginTab = 'installed';

views.plugins = async function(container) {
  pluginTab = 'installed';
  await renderPlugins(container);
};

async function renderPlugins(container) {
  if (pluginTab === 'installed') {
    await renderInstalledPlugins(container);
  } else {
    await renderMarketplace(container);
  }
}

function pluginTabsHtml() {
  return `
    <div class="plugin-tabs">
      <button class="plugin-tab ${pluginTab === 'installed' ? 'active' : ''}" data-tab="installed">Installed</button>
      <button class="plugin-tab ${pluginTab === 'browse' ? 'active' : ''}" data-tab="browse">Browse</button>
    </div>
  `;
}

function bindPluginTabs(container) {
  container.querySelectorAll('.plugin-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      pluginTab = btn.dataset.tab;
      await renderPlugins(container);
    });
  });
}

async function renderInstalledPlugins(container) {
  const plugins = await api.get('/plugins');
  container.innerHTML = `
    <div class="section-header">
      <h2>Plugins</h2>
      <p>${plugins.length} installed</p>
    </div>
    ${pluginTabsHtml()}
    <table class="data-table">
      <thead>
        <tr>
          <th>Plugin</th>
          <th>Description</th>
          <th>Version</th>
          <th>Scope</th>
          <th>Project</th>
          <th>Installed</th>
          <th>Active</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${plugins.map(p => `
          <tr>
            <td class="mono">${escHtml(p.name)}</td>
            <td class="plugin-description">${escHtml(p.description || '—')}</td>
            <td>${escHtml(p.version || '—')}</td>
            <td>${escHtml(p.scope || '—')}</td>
            <td class="mono">${escHtml(shortProject(p.projectPath || ''))}</td>
            <td>${shortDate(p.installedAt)}</td>
            <td>${p.active ? '<span class="plugin-active">Yes</span>' : '<span class="plugin-inactive">No</span>'}</td>
            <td class="plugin-actions">
              <button class="btn-plugin-cmd btn-plugin-toggle" data-plugin-name="${escHtml(p.name)}" data-active="${p.active}">${p.active ? 'Disable' : 'Enable'}</button>
              <button class="btn-plugin-cmd btn-plugin-uninstall" data-plugin-name="${escHtml(p.name)}">Uninstall</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  bindPluginTabs(container);

  container.querySelectorAll('.btn-plugin-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.pluginName;
      const active = btn.dataset.active === 'true';
      const endpoint = active ? 'disable' : 'enable';
      const result = await api.post(`/plugins/${encodeURIComponent(name)}/${endpoint}`);
      if (result.ok) {
        btn.dataset.active = (!active).toString();
        btn.textContent = active ? 'Enable' : 'Disable';
        const activeCell = btn.closest('tr').querySelector('.plugin-active, .plugin-inactive');
        if (activeCell) {
          activeCell.className = active ? 'plugin-inactive' : 'plugin-active';
          activeCell.textContent = active ? 'No' : 'Yes';
        }
      } else {
        alert('Failed: ' + (result.error || 'unknown error'));
      }
    });
  });

  container.querySelectorAll('.btn-plugin-uninstall').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.pluginName;
      if (!confirm(`Uninstall ${name}?`)) return;
      const result = await api.delete(`/plugins/${encodeURIComponent(name)}`);
      if (result.ok) {
        btn.closest('tr').remove();
      } else {
        alert('Failed: ' + (result.error || 'unknown error'));
      }
    });
  });
}

let mktQ = '';
let mktCategory = '';

async function renderMarketplace(container) {
  const [available, installed] = await Promise.all([
    api.get('/marketplaces'),
    api.get('/plugins'),
  ]);

  const installedNames = new Set(installed.map(p => p.name));

  const categories = [...new Set(available.filter(p => p.category).map(p => p.category))].sort();

  let filtered = available;
  if (mktQ) {
    const lq = mktQ.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(lq) ||
      (p.description || '').toLowerCase().includes(lq) ||
      (p.category || '').toLowerCase().includes(lq)
    );
  }
  if (mktCategory) {
    filtered = filtered.filter(p => p.category === mktCategory);
  }

  const categoryFilterHtml = `
    <div class="tag-filter-bar">
      <span class="tag-filter-label">Category:</span>
      <button class="tag-filter-chip ${!mktCategory ? 'active' : ''}" data-mkt-cat="">All</button>
      ${categories.map(c => `
        <button class="tag-filter-chip ${mktCategory === c ? 'active' : ''}" data-mkt-cat="${escHtml(c)}">${escHtml(c)}</button>
      `).join('')}
    </div>
  `;

  container.innerHTML = `
    <div class="section-header">
      <h2>Plugins</h2>
      <p>${filtered.length} of ${available.length} available</p>
    </div>
    ${pluginTabsHtml()}
    <div class="search-bar">
      <input type="text" id="mkt-search" placeholder="Search plugins..." value="${escHtml(mktQ)}">
      <button id="mkt-search-btn">Search</button>
      <button id="mkt-clear-btn">Clear</button>
    </div>
    ${categoryFilterHtml}
    <div class="marketplace-grid">
      ${filtered.map(p => {
        const isInstalled = installedNames.has(p.name);
        return `
          <div class="marketplace-card">
            <div class="plan-card-header">
              <div>
                <div class="plan-name mono">${escHtml(p.name)}</div>
                <span class="mkt-badge">${escHtml(p.marketplace)}</span>
              </div>
              ${isInstalled
                ? `<span class="plugin-active mkt-installed">Installed</span>`
                : `<button class="btn-plugin-cmd btn-mkt-install" data-key="${escHtml(p.key)}">Install</button>`
              }
            </div>
            <div class="plugin-description" style="margin-top:8px">${escHtml(p.description || '—')}</div>
            <div class="plan-footer">
              <span class="plan-meta">${escHtml(p.category || '—')}${p.installs ? ' · ' + Number(p.installs).toLocaleString() + ' installs' : ''}</span>
            </div>
          </div>
        `;
      }).join('') || '<div class="empty">No plugins match</div>'}
    </div>
  `;

  bindPluginTabs(container);

  document.getElementById('mkt-search-btn').onclick = () => {
    mktQ = document.getElementById('mkt-search').value.trim();
    renderMarketplace(container);
  };
  document.getElementById('mkt-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('mkt-search-btn').click();
  });
  document.getElementById('mkt-clear-btn').onclick = () => {
    mktQ = '';
    mktCategory = '';
    renderMarketplace(container);
  };

  container.querySelectorAll('[data-mkt-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      mktCategory = btn.dataset.mktCat;
      renderMarketplace(container);
    });
  });

  container.querySelectorAll('.btn-mkt-install').forEach(btn => {
    btn.addEventListener('click', () => {
      copyText(`claude plugin install ${btn.dataset.key}`, btn);
    });
  });
};

// Configs view
views.configs = async function(container) {
  await renderConfigs(container);
};

async function renderConfigs(container) {
  const configs = await api.get('/configs');
  document.getElementById('cnt-configs').textContent = configs.length || '';

  container.innerHTML = `
    <div class="section-header">
      <h2>Configs</h2>
      <p>CLAUDE.md and related files across all projects</p>
    </div>
    <div class="configs-layout">
      <div class="configs-list" id="configs-list">
        ${configs.map((c, i) => `
          <div class="config-item ${c.scope === 'global' ? 'config-global' : ''}" data-idx="${i}" data-file="${escHtml(c.filePath)}" data-label="${escHtml(c.label)}">
            <div class="config-label">${escHtml(c.label)}</div>
            <div class="config-meta">${fmtBytes(c.size)} · ${shortDate(c.mtime)}</div>
          </div>
        `).join('')}
      </div>
      <div class="configs-editor" id="configs-editor">
        <div class="configs-editor-empty">Select a file to view or edit</div>
      </div>
    </div>
  `;

  container.querySelectorAll('.config-item').forEach(item => {
    item.addEventListener('click', () => {
      container.querySelectorAll('.config-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      loadConfigEditor(item.dataset.file, item.dataset.label, document.getElementById('configs-editor'));
    });
  });

  // Auto-open first
  const first = container.querySelector('.config-item');
  if (first) first.click();
}

async function loadConfigEditor(filePath, label, editorPane) {
  editorPane.innerHTML = '<div class="loading">Loading...</div>';
  const data = await fetch('/api/configs/content?file=' + encodeURIComponent(filePath)).then(r => r.json());
  if (data.error) { editorPane.innerHTML = `<div class="empty">${escHtml(data.error)}</div>`; return; }
  let dirty = false;

  editorPane.innerHTML = `
    <div class="config-editor-header">
      <span class="mono config-editor-path">${escHtml(label)}</span>
      <div class="config-editor-actions">
        <span class="config-saved-msg" id="config-saved-msg"></span>
        <button class="config-save-btn" id="config-save-btn" disabled>Save</button>
      </div>
    </div>
    <textarea class="config-textarea" id="config-textarea" spellcheck="false">${escHtml(data.content)}</textarea>
  `;

  const textarea = editorPane.querySelector('#config-textarea');
  const saveBtn = editorPane.querySelector('#config-save-btn');
  const savedMsg = editorPane.querySelector('#config-saved-msg');

  textarea.addEventListener('input', () => {
    dirty = true;
    saveBtn.disabled = false;
    savedMsg.textContent = '';
  });

  // Ctrl+S / Cmd+S to save
  textarea.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (!saveBtn.disabled) saveBtn.click();
    }
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      const r = await fetch('/api/configs/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: filePath, content: textarea.value }),
      });
      const result = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (result.ok) {
        dirty = false;
        saveBtn.textContent = 'Save';
        savedMsg.textContent = 'Saved';
        setTimeout(() => savedMsg.textContent = '', 2000);
      } else {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
        alert('Save failed: ' + (result.error || 'unknown error'));
      }
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      alert('Save failed: ' + err.message);
    }
  });
}

// Settings view
views.settings = async function(container) {
  const settings = await api.get('/settings');
  container.innerHTML = `
    <div class="section-header">
      <h2>Settings</h2>
      <p>~/.claude/settings.json — read-only view</p>
    </div>
    <div class="json-view">${escHtml(JSON.stringify(settings, null, 2))}</div>
  `;
};

// Projects view
views.projects = async function(container) {
  await renderProjects(container);
};

async function renderProjects(container) {
  try {
    const projects = await api.get('/projects');
    container.innerHTML = `
    <div class="section-header">
      <h2>Projects</h2>
      <p>${projects.length} tracked projects</p>
    </div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Path</th>
          <th>CLAUDE.md</th>
          <th>Memory</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${projects.map(p => `
          <tr data-project-key="${escHtml(p.key)}">
            <td class="mono">${p.path ? escHtml(p.path) : '<span class="faint">(unknown)</span>'}</td>
            <td>${p.hasClaudeMd ? '<span class="tag tag-project">yes</span>' : '<span class="faint">—</span>'}</td>
            <td>${p.hasMemory ? `<span class="tag tag-user">${p.memCount} files</span>` : '<span class="faint">—</span>'}</td>
            <td><button class="btn-delete btn-trash-project" style="opacity:0">Trash</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.querySelectorAll('tr[data-project-key]').forEach(row => {
    const btn = row.querySelector('.btn-trash-project');
    row.addEventListener('mouseenter', () => btn.style.opacity = '1');
    row.addEventListener('mouseleave', () => btn.style.opacity = '0');

    btn.addEventListener('click', async () => {
      const key = row.dataset.projectKey;
      const result = await api.delete('/projects/' + encodeURIComponent(key));
      if (result.ok) {
        row.remove();
        await refreshSidebarStats();
      } else {
        alert('Failed: ' + (result.error || 'unknown error'));
      }
    });
  });
  } catch (err) {
    showError(container, err.message);
  }
}

// Trash view
views.trash = async function(container) {
  await renderTrash(container);
};

async function renderTrash(container) {
  try {
    const items = await api.get('/trash');
    document.getElementById('cnt-trash').textContent = items.length || '';

  if (items.length === 0) {
    container.innerHTML = `
      <div class="section-header"><h2>Trash</h2><p>No items in trash</p></div>
      <div class="empty">Trash is empty</div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="section-header">
      <h2>Trash</h2>
      <p>${items.length} item${items.length !== 1 ? 's' : ''} — restore or permanently delete</p>
    </div>
    <table class="data-table">
      <thead>
        <tr>
          <th>File</th>
          <th>Original location</th>
          <th>Trashed</th>
          <th>Size</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr data-trash-file="${escHtml(item.file)}">
            <td class="mono">${escHtml(path.basename(item.file).replace(/^\d+__/, ''))}${item.isDir ? ' <span class="faint">(dir)</span>' : ''}</td>
            <td class="mono" style="color:var(--text-muted)">${escHtml(shortProject(item.originalPath))}</td>
            <td>${formatDate(item.trashedAt)}</td>
            <td>${fmtBytes(item.size)}</td>
            <td style="white-space:nowrap">
              <button class="btn-restore" style="margin-right:6px">Restore</button>
              <button class="btn-purge">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.querySelectorAll('tr[data-trash-file]').forEach(row => {
    const file = row.dataset.trashFile;

    row.querySelector('.btn-restore').addEventListener('click', async () => {
      const r = await fetch('/api/trash/' + encodeURIComponent(file) + '/restore', { method: 'POST' });
      const result = await r.json();
      if (result.ok) {
        row.remove();
        const remaining = container.querySelectorAll('tr[data-trash-file]').length;
        document.getElementById('cnt-trash').textContent = remaining || '';
        if (remaining === 0) renderTrash(container);
        await refreshSidebarStats();
      } else {
        alert('Restore failed: ' + result.error);
      }
    });

    row.querySelector('.btn-purge').addEventListener('click', async () => {
      const name = path.basename(file).replace(/^\d+__/, '');
      if (!confirm(`Permanently delete "${name}"?\n\nThis cannot be undone.`)) return;
      const result = await api.delete('/trash/' + encodeURIComponent(file));
      if (result.ok) {
        row.remove();
        const remaining = container.querySelectorAll('tr[data-trash-file]').length;
        document.getElementById('cnt-trash').textContent = remaining || '';
        if (remaining === 0) renderTrash(container);
        await refreshSidebarStats();
      } else {
        alert('Delete failed: ' + result.error);
      }
    });
  });
  } catch (err) {
    showError(container, err.message);
  }
}

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Handle hash-based navigation
function routeFromHash() {
  const hash = location.hash.slice(1) || 'overview';
  if (views[hash]) navigate(hash);
  else navigate('overview');
}

window.addEventListener('hashchange', routeFromHash);
routeFromHash();

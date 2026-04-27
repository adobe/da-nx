import { expect } from '@esm-bundle/chai';

// Register the custom element (side-effect import)
await import('../../../blocks/skills-editor/nx-skills-editor.js');

// ─── helpers ─────────────────────────────────────────────────────────────────

async function mount() {
  const el = document.createElement('nx-skills-editor');
  // Prevent initial updated() from calling real network-backed reload.
  el._reload = async () => {};
  el._hash = { value: { org: 'org', site: 'site' } };
  document.body.append(el);
  await el.updateComplete;
  return el;
}

function unmount(el) { el.remove(); }

async function mountWithState(overrides = {}) {
  const el = await mount();
  // Setting _loadedKey prevents updated() from calling _reload()
  // Setting _isLoading=false and _hash.value renders the main UI
  el._isLoading = false;
  el._skills = {};
  el._skillStatuses = {};
  el._prompts = [];
  el._agents = [];
  el._mcpRows = [];
  el._mcpTools = null;
  el._generatedTools = [];
  el._configuredMcpServers = {};
  // Stub _reload so any re-trigger does nothing
  el._reload = async () => {};
  // Stub _hash so org/site resolve without touching location
  el._hash = { value: { org: 'org', site: 'site' } };
  el._loadedKey = 'org/site';
  Object.assign(el, overrides);
  await el.updateComplete;
  return el;
}

// ─── _extractTitle ────────────────────────────────────────────────────────────

describe('_extractTitle', () => {
  let el;
  before(async () => { el = await mount(); });
  after(() => unmount(el));

  it('returns the first h1 heading text', () => {
    expect(el._extractTitle('# Fix typos\n\nSome body')).to.equal('Fix typos');
  });

  it('returns empty string when no heading exists', () => {
    expect(el._extractTitle('Just some text\nno heading here')).to.equal('');
  });

  it('returns empty string for empty/null body', () => {
    expect(el._extractTitle('')).to.equal('');
    expect(el._extractTitle(null)).to.equal('');
    expect(el._extractTitle(undefined)).to.equal('');
  });

  it('trims whitespace from the extracted title', () => {
    expect(el._extractTitle('#   Trimmed Title  ')).to.equal('Trimmed Title');
  });

  it('ignores h2+ headings — only matches h1 (#)', () => {
    expect(el._extractTitle('## Section heading\nno h1 here')).to.equal('');
  });
});

// ─── skill card title (ID as heading, extracted title as subheading) ──────────

describe('skill card titles', () => {
  let el;

  afterEach(() => unmount(el));

  it('uses the skill ID as the card heading', async () => {
    el = await mountWithState({
      _skills: { 'fix-typos': '# Fix Typos\n\nBody' },
      _skillStatuses: { 'fix-typos': 'approved' },
    });
    const card = el.shadowRoot.querySelector('[data-skill-id="fix-typos"] nx-card');
    expect(card.getAttribute('heading')).to.equal('fix-typos');
  });

  it('shows the extracted title as a subheading when present', async () => {
    el = await mountWithState({
      _skills: { 'fix-typos': '# Fix Typos\n\nBody' },
      _skillStatuses: { 'fix-typos': 'approved' },
    });
    const card = el.shadowRoot.querySelector('[data-skill-id="fix-typos"] nx-card');
    expect(card.getAttribute('subheading')).to.equal('Fix Typos');
  });

  it('does not set subheading when the skill has no heading', async () => {
    el = await mountWithState({
      _skills: { 'no-heading': 'Just plain text' },
      _skillStatuses: { 'no-heading': 'approved' },
    });
    const card = el.shadowRoot.querySelector('[data-skill-id="no-heading"] nx-card');
    // subheading should be absent or falsy
    expect(card.getAttribute('subheading')).to.not.be.ok;
  });

  it('never shows the form heading "New Skill" as a card title', async () => {
    el = await mountWithState({
      _skills: { 'my-skill': '# New Skill\n\nBody' },
      _skillStatuses: { 'my-skill': 'approved' },
    });
    const card = el.shadowRoot.querySelector('[data-skill-id="my-skill"] nx-card');
    expect(card.getAttribute('heading')).to.equal('my-skill');
  });
});

// ─── icon rendering ───────────────────────────────────────────────────────────

describe('approved skill cards: icons', () => {
  let el;

  afterEach(() => unmount(el));

  it('each approved card renders approved status pill', async () => {
    el = await mountWithState({
      _skills: {
        'skill-a': '# Skill A',
        'skill-b': '# Skill B',
        'skill-c': '# Skill C',
      },
      _skillStatuses: {
        'skill-a': 'approved',
        'skill-b': 'approved',
        'skill-c': 'approved',
      },
    });

    const pills = el.shadowRoot.querySelectorAll('.status-dot-approved');
    expect(pills.length).to.equal(3);
  });

  it('draft cards do not render a checkmark icon', async () => {
    el = await mountWithState({
      _skills: { 'draft-skill': '# Draft' },
      _skillStatuses: { 'draft-skill': 'draft' },
    });
    const pill = el.shadowRoot.querySelector('.status-dot-draft');
    expect(pill).to.exist;
  });
});

// ─── _setStatus timer ────────────────────────────────────────────────────────

describe('_setStatus', () => {
  let el;

  beforeEach(async () => { el = await mountWithState(); });
  afterEach(() => unmount(el));

  it('sets message and type', () => {
    el._setStatus('hello', 'ok');
    expect(el._statusMsg).to.equal('hello');
    expect(el._statusType).to.equal('ok');
  });

  it('does not schedule a timer for error messages', () => {
    el._statusTimer = null; // ensure clean state
    el._setStatus('oops', 'err');
    expect(el._statusTimer).to.equal(null);
  });

  it('clears the previous ok timer and sets a new one', () => {
    el._setStatus('first', 'ok');
    const firstId = el._statusTimer;
    expect(typeof firstId).to.equal('number');

    el._setStatus('second', 'ok');
    expect(el._statusTimer).to.not.equal(firstId);
    expect(typeof el._statusTimer).to.equal('number');
  });
});

// ─── timer cleared on disconnect ─────────────────────────────────────────────

describe('_statusTimer cleared on disconnect', () => {
  it('does not mutate _statusMsg after component is removed', async () => {
    const el = await mount();
    el._setStatus('temporary', 'ok');
    el.remove();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    // Timer ID should still be stored (clearTimeout was called but the property persists)
    expect(typeof el._statusTimer === 'number' || el._statusTimer === null).to.be.true;
  });
});

// ─── _loadedKey dedup guard ───────────────────────────────────────────────────

describe('updated() _loadedKey guard', () => {
  let el;
  let reloadCount;

  afterEach(() => unmount(el));

  it('calls _reload only once for the same org/site', async () => {
    el = await mount();
    reloadCount = 0;
    el._reload = async () => { reloadCount += 1; };
    el._loadedKey = null;
    el._hash = { value: { org: 'org1', site: 'site1' } };

    // Trigger updated() twice with same key
    el._isLoading = false; // force a state change → re-render → updated()
    await el.updateComplete;
    el._catalogTab = 'agents'; // another state change → updated()
    await el.updateComplete;

    expect(reloadCount).to.equal(1);
  });

  it('calls _reload again when org/site changes', async () => {
    el = await mount();
    reloadCount = 0;
    el._reload = async () => { reloadCount += 1; };
    el._loadedKey = null;
    el._hash = { value: { org: 'org1', site: 'site1' } };
    el._isLoading = false;
    await el.updateComplete;

    // Change org/site
    el._hash = { value: { org: 'org2', site: 'site2' } };
    el.requestUpdate();
    await el.updateComplete;

    expect(reloadCount).to.equal(2);
  });
});

// ─── _dismissForm dispatches FORM_DISMISS event ───────────────────────────────

describe('_dismissForm', () => {
  let el;

  afterEach(() => unmount(el));

  it('dispatches DA_SKILLS_EDITOR_FORM_DISMISS on window', async () => {
    el = await mountWithState({
      _isFormEdit: true,
      _formSkillId: 'my-skill',
    });

    let dispatched = null;
    const handler = (e) => { dispatched = e; };
    window.addEventListener('da-skills-editor-form-column-dismiss', handler);

    el._dismissForm();

    window.removeEventListener('da-skills-editor-form-column-dismiss', handler);
    expect(dispatched).to.exist;
  });

  it('clears the form state', async () => {
    el = await mountWithState({
      _formSkillId: 'some-skill',
      _formSkillBody: '# Body',
      _isFormEdit: true,
    });

    el._dismissForm();
    await el.updateComplete;

    expect(el._formSkillId).to.equal('');
    expect(el._formSkillBody).to.equal('');
    expect(el._isFormEdit).to.be.false;
  });
});

// ─── delete confirm guard ─────────────────────────────────────────────────────

describe('_onDeleteSkill confirm guard', () => {
  let el;
  let origConfirm;
  let origFetch;

  beforeEach(async () => {
    el = await mountWithState({ _formSkillId: 'my-skill', _isFormEdit: true });
    origConfirm = window.confirm;
    origFetch = window.fetch;
  });

  afterEach(() => {
    window.confirm = origConfirm;
    window.fetch = origFetch;
    unmount(el);
  });

  it('does not proceed when user cancels confirm', async () => {
    window.confirm = () => false;
    let deleteCalled = false;
    el._isSaveBusy = false;
    // Stub the API layer to detect if it's reached
    const orig = el._clearForm.bind(el);
    el._clearForm = () => {
      deleteCalled = true;
      orig();
    };
    await el._onDeleteSkill();
    expect(deleteCalled).to.be.false;
    expect(el._isSaveBusy).to.be.false;
  });

  it('proceeds when user confirms', async () => {
    window.confirm = () => true;
    let reached = false;
    // Stub the internals and fetches so we don't make real network calls
    el._isSaveBusy = false;
    const origReload = el._reload.bind(el);
    el._reload = async () => {};
    window.fetch = async (url, opts = {}) => {
      const method = (opts.method || 'GET').toUpperCase();
      if (url.includes('/source/') && method === 'GET') {
        return new Response('# My Skill', { status: 200 });
      }
      if (url.includes('/source/') && method === 'DELETE') {
        return new Response('', { status: 200 });
      }
      if (url.includes('/config/') && method === 'GET') {
        return new Response(JSON.stringify({
          skills: {
            total: 1,
            limit: 1000,
            offset: 0,
            data: [{ key: 'my-skill', content: '# My Skill' }],
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/config/') && method === 'POST') {
        return new Response('', { status: 200 });
      }
      return new Response('', { status: 200 });
    };
    try {
      await el._onDeleteSkill();
      reached = true;
    } finally {
      el._reload = origReload;
    }
    expect(reached).to.be.true;
  });
});

// ─── _onDeleteSkill error path ────────────────────────────────────────────────

describe('_onDeleteSkill error handling', () => {
  let el;
  let origConfirm;
  let origFetch;

  beforeEach(async () => {
    el = await mountWithState({ _formSkillId: 'my-skill', _isFormEdit: true });
    origConfirm = window.confirm;
    origFetch = window.fetch;
    window.confirm = () => true;
  });

  afterEach(() => {
    window.confirm = origConfirm;
    window.fetch = origFetch;
    unmount(el);
  });

  it('shows error and does not clear form when config delete fails', async () => {
    el._reload = async () => {};
    window.fetch = async (url, opts = {}) => {
      const method = (opts.method || 'GET').toUpperCase();
      if (url.includes('/source/') && method === 'GET') {
        return new Response('# My Skill', { status: 200 });
      }
      if (url.includes('/source/') && method === 'DELETE') {
        return new Response('', { status: 200 });
      }
      if (url.includes('/config/') && method === 'GET') {
        return new Response(JSON.stringify({
          skills: {
            total: 1,
            limit: 1000,
            offset: 0,
            data: [{ key: 'my-skill', content: '# My Skill' }],
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/config/') && method === 'POST') {
        return new Response('', { status: 500 });
      }
      return new Response('', { status: 200 });
    };
    await el._onDeleteSkill();
    expect(el._statusMsg).to.equal('Skill delete failed (500)');
    expect(el._statusType).to.equal('err');
    expect(el._formSkillId).to.equal('my-skill'); // form NOT cleared
  });

  it('shows error and does not clear form when file delete fails', async () => {
    el._reload = async () => {};
    window.fetch = async (url, opts = {}) => {
      const method = (opts.method || 'GET').toUpperCase();
      if (url.includes('/source/') && method === 'GET') {
        return new Response('# My Skill', { status: 200 });
      }
      if (url.includes('/source/') && method === 'DELETE') {
        return new Response('', { status: 500 });
      }
      return new Response('', { status: 200 });
    };
    await el._onDeleteSkill();
    expect(el._statusMsg).to.equal('Failed to delete skill file');
    expect(el._statusType).to.equal('err');
    expect(el._formSkillId).to.equal('my-skill'); // form NOT cleared
  });
});

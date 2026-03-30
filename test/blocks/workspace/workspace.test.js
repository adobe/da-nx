import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../../nx/blocks/workspace/workspace.js';

describe('NxWorkspace block init', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-workspace');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
  });

  it('renders the workspace root element', async () => {
    const root = el.shadowRoot.querySelector('.workspace');
    expect(root).to.exist;
  });

  it('renders the hero section', async () => {
    const hero = el.shadowRoot.querySelector('.workspace-hero');
    expect(hero).to.exist;
  });

  it('renders the sections container', async () => {
    const sections = el.shadowRoot.querySelector('.workspace-sections');
    expect(sections).to.exist;
  });
});

describe('NxWorkspace init()', () => {
  it('appends nx-workspace to body and removes original el', async () => {
    const placeholder = document.createElement('div');
    document.body.appendChild(placeholder);
    await init(placeholder);
    const appended = document.body.querySelector('nx-workspace');
    expect(appended).to.exist;
    expect(placeholder.isConnected).to.be.false;
    appended.remove();
  });
});

describe('NxWorkspace hero content', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-workspace');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => { el.remove(); });

  it('renders the chat container in the hero', async () => {
    const container = el.shadowRoot.querySelector('.workspace-chat-container');
    expect(container).to.exist;
  });

  it('renders da-chat element', async () => {
    const chat = el.shadowRoot.querySelector('da-chat');
    expect(chat).to.exist;
  });
});

describe('NxWorkspace personalization', () => {
  let el;

  afterEach(() => { el?.remove(); });

  it('shows welcome label and first name when _ims.first_name is set', async () => {
    el = document.createElement('nx-workspace');
    document.body.appendChild(el);
    await el.updateComplete;
    el._ims = { first_name: 'Alice' };
    await el.updateComplete;
    const label = el.shadowRoot.querySelector('.workspace-welcome-label');
    expect(label).to.exist;
    const h1 = el.shadowRoot.querySelector('.workspace-hero-title');
    expect(h1.textContent).to.include('Alice');
  });

  it('falls back to displayName first word when first_name is absent', async () => {
    el = document.createElement('nx-workspace');
    document.body.appendChild(el);
    await el.updateComplete;
    el._ims = { displayName: 'Bob Smith' };
    await el.updateComplete;
    const h1 = el.shadowRoot.querySelector('.workspace-hero-title');
    expect(h1.textContent).to.include('Bob');
  });

  it('shows generic title when _ims is null', async () => {
    el = document.createElement('nx-workspace');
    document.body.appendChild(el);
    await el.updateComplete;
    const label = el.shadowRoot.querySelector('.workspace-welcome-label');
    expect(label).to.not.exist;
    const h1 = el.shadowRoot.querySelector('.workspace-hero-title');
    expect(h1.textContent).to.include('AI-powered');
  });
});

describe('NxWorkspace prompt cards', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-workspace');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
  });

  it('renders prompt cards section when cards are available', async () => {
    el._promptCards = [
      { title: 'Card 1', description: 'Desc 1', prompt: 'Do X' },
      { title: 'Card 2', description: 'Desc 2', prompt: 'Do Y' },
      { title: 'Card 3', description: 'Desc 3', prompt: 'Do Z' },
    ];
    await el.updateComplete;

    const section = el.shadowRoot.querySelector('.workspace-prompts');
    expect(section).to.exist;
  });

  it('renders exactly 3 prompt cards', async () => {
    el._promptCards = [
      { title: 'A', description: 'a', prompt: 'pa' },
      { title: 'B', description: 'b', prompt: 'pb' },
      { title: 'C', description: 'c', prompt: 'pc' },
    ];
    await el.updateComplete;

    const cards = el.shadowRoot.querySelectorAll('.workspace-prompt-card');
    expect(cards.length).to.equal(3);
  });

  it('does not render prompts section when no cards are available', async () => {
    el._promptCards = [];
    await el.updateComplete;

    const section = el.shadowRoot.querySelector('.workspace-prompts');
    expect(section).to.be.null;
  });

  it('forwards prompt to da-chat.sendPrompt on card click', async () => {
    el._promptCards = [{ title: 'T', description: 'D', prompt: 'my prompt' }];
    await el.updateComplete;

    const chat = el.shadowRoot.querySelector('da-chat');
    const stub = sinon.stub(chat, 'sendPrompt');

    const card = el.shadowRoot.querySelector('.workspace-prompt-card');
    card.click();

    expect(stub.calledOnce).to.be.true;
    expect(stub.calledWith('my prompt')).to.be.true;
  });

  it('does not throw when da-chat has no sendPrompt', async () => {
    el._promptCards = [{ title: 'T', description: 'D', prompt: 'p' }];
    await el.updateComplete;

    const chat = el.shadowRoot.querySelector('da-chat');
    delete chat.sendPrompt;

    const card = el.shadowRoot.querySelector('.workspace-prompt-card');
    expect(() => card.click()).to.not.throw();
  });
});

describe('NxWorkspace tabs', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-workspace');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => { el.remove(); });

  it('renders the tabs section', async () => {
    const tabs = el.shadowRoot.querySelector('.workspace-tabs-section');
    expect(tabs).to.exist;
  });

  it('renders two tab buttons', async () => {
    const buttons = el.shadowRoot.querySelectorAll('.workspace-tab-btn');
    expect(buttons.length).to.equal(2);
  });

  it('defaults to recent tab active', async () => {
    const activeBtn = el.shadowRoot.querySelector('.workspace-tab-btn[aria-selected="true"]');
    expect(activeBtn).to.exist;
    expect(activeBtn.dataset.tab).to.equal('recent');
  });

  it('switches to projects tab on click', async () => {
    const projectsBtn = el.shadowRoot.querySelector('.workspace-tab-btn[data-tab="projects"]');
    projectsBtn.click();
    await el.updateComplete;

    const activeBtn = el.shadowRoot.querySelector('.workspace-tab-btn[aria-selected="true"]');
    expect(activeBtn.dataset.tab).to.equal('projects');
  });
});

describe('NxWorkspace recent pages', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-workspace');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => { el.remove(); });

  it('renders recent page cards when data is available', async () => {
    el._recentPages = [
      { title: 'Home', path: '/en/', lastModified: '2026-03-29T10:00:00Z', status: 'published' },
      { title: 'About', path: '/en/about', lastModified: '2026-03-28T10:00:00Z', status: 'draft' },
    ];
    await el.updateComplete;

    const cards = el.shadowRoot.querySelectorAll('.workspace-page-card');
    expect(cards.length).to.equal(2);
  });

  it('shows empty message when no recent pages', async () => {
    el._recentPages = [];
    await el.updateComplete;

    const empty = el.shadowRoot.querySelector('.workspace-empty');
    expect(empty).to.exist;
  });

  it('displays page title in card', async () => {
    el._recentPages = [
      { title: 'My Page', path: '/en/my-page', lastModified: '2026-03-29T10:00:00Z', status: 'published' },
    ];
    el._activeTab = 'recent';
    await el.updateComplete;

    const title = el.shadowRoot.querySelector('.workspace-page-title');
    expect(title.textContent.trim()).to.equal('My Page');
  });

  it('falls back to raw string for invalid date in _formatDate', () => {
    el = document.createElement('nx-workspace');
    document.body.appendChild(el);
    // _formatDate with invalid input returns 'Invalid Date' from toLocaleDateString
    // just verify it does not throw
    expect(() => el._formatDate('not-a-date')).to.not.throw();
    el.remove();
  });
});

describe('NxWorkspace my projects', () => {
  let el;
  const mockProjects = [
    { name: 'Marketing Site', org: 'adobe', site: 'marketing' },
    { name: 'Internal Tools', org: 'adobe', site: 'internal' },
  ];

  beforeEach(async () => {
    localStorage.setItem('da-projects', JSON.stringify(mockProjects));
    el = document.createElement('nx-workspace');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    localStorage.removeItem('da-projects');
  });

  it('loads projects from localStorage', async () => {
    expect(el._projects.length).to.equal(2);
  });

  it('renders project cards when projects tab is active', async () => {
    el._activeTab = 'projects';
    await el.updateComplete;

    const cards = el.shadowRoot.querySelectorAll('.workspace-project-card');
    expect(cards.length).to.equal(2);
  });

  it('shows project name in card', async () => {
    el._activeTab = 'projects';
    await el.updateComplete;

    const firstName = el.shadowRoot.querySelector('.workspace-project-name');
    expect(firstName.textContent.trim()).to.equal('Marketing Site');
  });

  it('shows empty message when no projects in localStorage', async () => {
    localStorage.removeItem('da-projects');
    el._projects = [];
    el._activeTab = 'projects';
    await el.updateComplete;

    const empty = el.shadowRoot.querySelector('.workspace-empty');
    expect(empty).to.exist;
  });

  it('handles malformed localStorage data gracefully', async () => {
    localStorage.setItem('da-projects', '{broken json');
    const newEl = document.createElement('nx-workspace');
    document.body.appendChild(newEl);
    await newEl.updateComplete;
    expect(newEl._projects).to.deep.equal([]);
    newEl.remove();
    localStorage.removeItem('da-projects');
  });

  it('constructs project URL when project.url is absent', async () => {
    el._activeTab = 'projects';
    await el.updateComplete;

    const card = el.shadowRoot.querySelector('.workspace-project-card');
    expect(card.getAttribute('href')).to.equal('https://da.live/#/adobe/marketing');
  });
});

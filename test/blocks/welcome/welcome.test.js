import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../../nx/blocks/welcome/welcome.js';

describe('NxWelcome block init', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-welcome');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
  });

  it('renders the welcome root element', async () => {
    const root = el.shadowRoot.querySelector('.welcome');
    expect(root).to.exist;
  });

  it('renders the hero section', async () => {
    const hero = el.shadowRoot.querySelector('.welcome-hero');
    expect(hero).to.exist;
  });

  it('renders the sections container', async () => {
    const sections = el.shadowRoot.querySelector('.welcome-sections');
    expect(sections).to.exist;
  });
});

describe('NxWelcome init()', () => {
  it('replaces block element with nx-welcome in place', async () => {
    const container = document.createElement('div');
    const placeholder = document.createElement('div');
    container.appendChild(placeholder);
    document.body.appendChild(container);
    await init(placeholder);
    const welcome = container.querySelector('nx-welcome');
    expect(welcome).to.exist;
    expect(placeholder.isConnected).to.be.false;
    container.remove();
  });
});

describe('NxWelcome hero content', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-welcome');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => { el.remove(); });

  it('renders the chat launcher in the hero', async () => {
    const launcher = el.shadowRoot.querySelector('.welcome-chat-launcher');
    expect(launcher).to.exist;
  });

  it('renders the chat input', async () => {
    const input = el.shadowRoot.querySelector('.welcome-chat-input');
    expect(input).to.exist;
  });

  it('renders the send button', async () => {
    const btn = el.shadowRoot.querySelector('.welcome-chat-send');
    expect(btn).to.exist;
  });

  it('send button is disabled when input is empty', async () => {
    const btn = el.shadowRoot.querySelector('.welcome-chat-send');
    expect(btn.disabled).to.be.true;
  });

  it('send button is enabled when input has text', async () => {
    el._prompt = 'Hello';
    await el.updateComplete;
    const btn = el.shadowRoot.querySelector('.welcome-chat-send');
    expect(btn.disabled).to.be.false;
  });
});

describe('NxWelcome personalization', () => {
  let el;

  afterEach(() => { el?.remove(); });

  it('shows welcome heading and subtitle when _ims.first_name is set', async () => {
    el = document.createElement('nx-welcome');
    document.body.appendChild(el);
    await el.updateComplete;
    el._ims = { first_name: 'Alice' };
    el._imsLoaded = true;
    await el.updateComplete;
    const h1 = el.shadowRoot.querySelector('.welcome-hero-title-loaded');
    expect(h1).to.exist;
    expect(h1.textContent).to.include('Alice');
    const subtitle = el.shadowRoot.querySelector('.welcome-hero-subtitle');
    expect(subtitle.textContent).to.include('AI-powered');
  });

  it('falls back to displayName first word when first_name is absent', async () => {
    el = document.createElement('nx-welcome');
    document.body.appendChild(el);
    await el.updateComplete;
    el._ims = { displayName: 'Bob Smith' };
    el._imsLoaded = true;
    await el.updateComplete;
    const h1 = el.shadowRoot.querySelector('.welcome-hero-title-loaded');
    expect(h1.textContent).to.include('Bob');
  });

  it('shows pending placeholder before IMS loads', async () => {
    el = document.createElement('nx-welcome');
    document.body.appendChild(el);
    await el.updateComplete;
    const pending = el.shadowRoot.querySelector('.welcome-hero-title-pending');
    expect(pending).to.exist;
  });

  it('shows only subtitle when IMS loads with no name (anonymous)', async () => {
    el = document.createElement('nx-welcome');
    document.body.appendChild(el);
    await el.updateComplete;
    el._ims = { anonymous: true };
    el._imsLoaded = true;
    await el.updateComplete;
    const h1 = el.shadowRoot.querySelector('.welcome-hero-title');
    expect(h1).to.not.exist;
    const subtitle = el.shadowRoot.querySelector('.welcome-hero-subtitle');
    expect(subtitle.textContent).to.include('AI-powered');
  });
});

describe('NxWelcome prompt cards', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-welcome');
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

    const section = el.shadowRoot.querySelector('.welcome-prompts');
    expect(section).to.exist;
  });

  it('renders exactly 3 prompt cards', async () => {
    el._promptCards = [
      { title: 'A', description: 'a', prompt: 'pa' },
      { title: 'B', description: 'b', prompt: 'pb' },
      { title: 'C', description: 'c', prompt: 'pc' },
    ];
    await el.updateComplete;

    const cards = el.shadowRoot.querySelectorAll('.welcome-prompt-card');
    expect(cards.length).to.equal(3);
  });

  it('does not render prompts section when no cards are available', async () => {
    el._promptCards = [];
    await el.updateComplete;

    const section = el.shadowRoot.querySelector('.welcome-prompts');
    expect(section).to.be.null;
  });

  it('clicking a card sets _prompt to the card prompt', async () => {
    el._promptCards = [{ title: 'T', description: 'D', prompt: 'my prompt' }];
    await el.updateComplete;

    // Stub _launchChat to prevent navigation in tests
    const stub = sinon.stub(el, '_launchChat');

    const card = el.shadowRoot.querySelector('.welcome-prompt-card');
    card.click();

    expect(el._prompt).to.equal('my prompt');
    expect(stub.calledOnce).to.be.true;
  });
});

describe('NxWelcome tabs', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-welcome');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => { el.remove(); });

  it('renders the tabs section', async () => {
    const tabs = el.shadowRoot.querySelector('.welcome-tabs-section');
    expect(tabs).to.exist;
  });

  it('renders two tab buttons', async () => {
    const buttons = el.shadowRoot.querySelectorAll('.welcome-tab-btn');
    expect(buttons.length).to.equal(2);
  });

  it('defaults to recent tab active', async () => {
    const activeBtn = el.shadowRoot.querySelector('.welcome-tab-btn[aria-selected="true"]');
    expect(activeBtn).to.exist;
    expect(activeBtn.dataset.tab).to.equal('recent');
  });

  it('switches to projects tab on click', async () => {
    const projectsBtn = el.shadowRoot.querySelector('.welcome-tab-btn[data-tab="projects"]');
    projectsBtn.click();
    await el.updateComplete;

    const activeBtn = el.shadowRoot.querySelector('.welcome-tab-btn[aria-selected="true"]');
    expect(activeBtn.dataset.tab).to.equal('projects');
  });
});

describe('NxWelcome recent pages', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-welcome');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => { el.remove(); });

  it('renders recent page cards when data is available', async () => {
    el._recentPages = [
      { path: '/en/index.html', date: '2026-03-29T10:00:00Z', summary: 'Updated hero' },
      { path: '/en/about.html', date: '2026-03-28T10:00:00Z', summary: 'Rewrote intro' },
    ];
    await el.updateComplete;

    const cards = el.shadowRoot.querySelectorAll('.welcome-page-card');
    expect(cards.length).to.equal(2);
  });

  it('shows empty message when no recent pages', async () => {
    el._recentPages = [];
    await el.updateComplete;

    const empty = el.shadowRoot.querySelector('.welcome-empty');
    expect(empty).to.exist;
  });

  it('derives title from path when no title field', async () => {
    el._recentPages = [
      { path: '/en/my-page.html', date: '2026-03-29T10:00:00Z', summary: 'Some changes' },
    ];
    el._activeTab = 'recent';
    await el.updateComplete;

    const title = el.shadowRoot.querySelector('.welcome-page-title');
    expect(title.textContent.trim()).to.equal('My page');
  });

  it('uses explicit title when provided', async () => {
    el._recentPages = [
      { title: 'My Page', path: '/en/my-page.html', date: '2026-03-29T10:00:00Z' },
    ];
    el._activeTab = 'recent';
    await el.updateComplete;

    const title = el.shadowRoot.querySelector('.welcome-page-title');
    expect(title.textContent.trim()).to.equal('My Page');
  });

  it('shows summary when available', async () => {
    el._recentPages = [
      { path: '/en/about.html', date: '2026-03-29T10:00:00Z', summary: 'Rewrote the intro paragraph' },
    ];
    el._activeTab = 'recent';
    await el.updateComplete;

    const summary = el.shadowRoot.querySelector('.welcome-page-summary');
    expect(summary.textContent.trim()).to.equal('Rewrote the intro paragraph');
  });

  it('falls back to raw string for invalid date in _formatDate', () => {
    el = document.createElement('nx-welcome');
    document.body.appendChild(el);
    expect(() => el._formatDate('not-a-date')).to.not.throw();
    el.remove();
  });
});

describe('NxWelcome my projects', () => {
  let el;
  const mockProjects = ['adobe/marketing', 'adobe/internal'];

  beforeEach(async () => {
    localStorage.setItem('da-sites', JSON.stringify(mockProjects));
    el = document.createElement('nx-welcome');
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    localStorage.removeItem('da-sites');
  });

  it('loads projects from localStorage', async () => {
    expect(el._projects.length).to.equal(2);
    expect(el._projects[0].name).to.equal('adobe/marketing');
    expect(el._projects[0].img).to.include('/blocks/browse/da-sites/img/cards/da-');
  });

  it('renders project cards when projects tab is active', async () => {
    el._activeTab = 'projects';
    await el.updateComplete;

    const cards = el.shadowRoot.querySelectorAll('.welcome-project-card');
    expect(cards.length).to.equal(2);
  });

  it('shows site name in card', async () => {
    el._activeTab = 'projects';
    await el.updateComplete;

    const name = el.shadowRoot.querySelector('.welcome-project-name');
    expect(name.textContent.trim()).to.equal('marketing');
  });

  it('shows org name in card', async () => {
    el._activeTab = 'projects';
    await el.updateComplete;

    const org = el.shadowRoot.querySelector('.welcome-project-org');
    expect(org.textContent.trim()).to.equal('adobe');
  });

  it('shows empty message when no projects in localStorage', async () => {
    localStorage.removeItem('da-sites');
    el._projects = [];
    el._activeTab = 'projects';
    await el.updateComplete;

    const empty = el.shadowRoot.querySelector('.welcome-empty');
    expect(empty).to.exist;
  });

  it('handles malformed localStorage data gracefully', async () => {
    localStorage.setItem('da-sites', '{broken json');
    const newEl = document.createElement('nx-welcome');
    document.body.appendChild(newEl);
    await newEl.updateComplete;
    expect(newEl._projects).to.deep.equal([]);
    newEl.remove();
    localStorage.removeItem('da-sites');
  });

  it('constructs browse URL from org/site', async () => {
    el._activeTab = 'projects';
    await el.updateComplete;

    const card = el.shadowRoot.querySelector('.welcome-project-card');
    const href = card.getAttribute('href');
    expect(href).to.match(/^\/browse.*#\/adobe\/marketing$/);
  });
});

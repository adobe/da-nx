import { expect } from '@esm-bundle/chai';
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

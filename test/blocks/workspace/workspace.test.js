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

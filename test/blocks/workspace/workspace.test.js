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

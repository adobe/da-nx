import { expect } from '@esm-bundle/chai';
import '../../../nx/blocks/workspace/workspace.js';

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

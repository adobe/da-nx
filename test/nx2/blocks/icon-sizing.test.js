import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../nx2/scripts/nx.js';

const cases = [
  {
    name: 'deploy icons',
    path: '/nx2/blocks/ew-actions/ew-actions.css',
    markup: `
      <svg class="deploy-glyph"></svg>
      <span class="deploy-card-check"><svg class="deploy-glyph"></svg></span>
      <button class="deploy-copy"><svg class="deploy-glyph"></svg></button>
    `,
    icons: [
      { selector: '.deploy-glyph', s: 16, m: 18 },
      { selector: '.deploy-card-check .deploy-glyph', s: 24, m: 26 },
      { selector: '.deploy-copy .deploy-glyph', s: 18, m: 20 },
    ],
  },
  {
    name: 'chat alert icons',
    path: '/nx2/blocks/chat-ao/artifacts/artifacts.css',
    markup: '<div class="ui-artifact-alert-icon"></div>',
    icons: [{ selector: '.ui-artifact-alert-icon', s: 20, m: 22 }],
  },
  {
    name: 'page evaluation and modal icons',
    path: '/nx2/blocks/chat-ao/artifacts/page-evaluation.css',
    markup: `
      <div class="ui-artifact-pe-icon"></div>
      <div class="ui-artifact-pe-chevron"></div>
      <div class="ui-artifact-pe-modal-heading-icon"></div>
      <div class="ui-artifact-pe-modal-copy-icon"></div>
      <button class="ui-artifact-pe-paging-btn"></button>
      <button class="ui-artifact-pe-modal-paging-btn"></button>
    `,
    icons: [
      { selector: '.ui-artifact-pe-icon', s: 20, m: 22 },
      { selector: '.ui-artifact-pe-chevron', s: 16, m: 18 },
      { selector: '.ui-artifact-pe-modal-heading-icon', s: 20, m: 22 },
      { selector: '.ui-artifact-pe-modal-copy-icon', s: 16, m: 18 },
      {
        selector: '.ui-artifact-pe-paging-btn', pseudo: '::after', s: 14, m: 16,
      },
      {
        selector: '.ui-artifact-pe-modal-paging-btn', pseudo: '::after', s: 16, m: 18,
      },
    ],
  },
  {
    name: 'shared button icons',
    path: '/nx2/styles/buttons.css',
    markup: `
      <button class="nx-btn-accent"><svg></svg></button>
      <button class="nx-action-btn-icon nx-btn-sm"><svg></svg></button>
    `,
    icons: [
      { selector: '.nx-btn-accent svg', s: 18, m: 18 },
      { selector: '.nx-action-btn-icon svg', s: 16, m: 16 },
    ],
  },
];

describe('component-owned icon sizing', () => {
  let host;
  let originalSize;
  let styles;

  before(async () => {
    styles = await Promise.all(cases.map(async ({ path }) => {
      const response = await fetch(path);
      expect(response.ok).to.be.true;
      const sheet = new CSSStyleSheet();
      await sheet.replace(await response.text());
      return sheet;
    }));
    await setConfig({ hostnames: [] });
    await Promise.all([
      import('../../../nx2/blocks/ew-actions/ew-actions.js'),
      import('../../../nx2/blocks/chat-ao/artifacts/page-evaluation.js'),
    ]);
  });

  beforeEach(() => {
    originalSize = localStorage.getItem('ui-size');
  });

  afterEach(() => {
    host?.remove();
    if (originalSize === null) localStorage.removeItem('ui-size');
    else localStorage.setItem('ui-size', originalSize);
  });

  cases.forEach(({ name, markup, icons }, index) => {
    it(`preserves explicit s/m dimensions for ${name}`, () => {
      host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.adoptedStyleSheets = [styles[index]];
      shadow.innerHTML = markup;
      document.body.append(host);
      for (const size of [null, 's', 'm', 's']) {
        if (size === null) host.removeAttribute('data-ui-size');
        else host.setAttribute('data-ui-size', size);
        icons.forEach(({
          selector, pseudo, s, m,
        }) => {
          const style = getComputedStyle(shadow.querySelector(selector), pseudo);
          const expected = `${size === 'm' ? m : s}px`;
          expect(style.width, selector).to.equal(expected);
          expect(style.height, selector).to.equal(expected);
        });
      }
    });
  });

  ['nx-ew-actions', 'nx-page-eval'].forEach((tag) => {
    [null, 's', 'm'].forEach((size) => {
      it(`initializes ${tag} host sizing from ${size ?? 'default'} preference`, async () => {
        if (size === null) localStorage.removeItem('ui-size');
        else localStorage.setItem('ui-size', size);
        host = document.createElement(tag);
        if (tag === 'nx-ew-actions') {
          host._loadPrepare = async () => {};
          host._loadStatus = async () => {};
          host._checkEnforcePreflight = async () => {};
        }
        document.body.append(host);
        await host.updateComplete;
        expect(host.dataset.uiSize).to.equal(size ?? 's');
      });
    });
  });
});

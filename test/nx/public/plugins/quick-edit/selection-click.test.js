import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse } from '@web/test-runner-commands';
import {
  setupNodeSelection,
  setSelectedNode,
} from '../../../../../nx/public/plugins/quick-edit/src/selection.js';
import { installClickForwarding } from '../../../../../nx/public/plugins/quick-edit/src/click-forwarding.js';

describe('quick-edit hover pill activation', () => {
  let posted;
  let cleanup;

  before(async () => {
    await new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/nx/public/plugins/quick-edit/quick-edit.css';
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
  });

  beforeEach(() => {
    document.body.innerHTML = '<main style="margin:80px">'
      + '<div class="teaser" data-block-index="50" style="width:600px;height:300px">teaser</div>'
      + '</main>';
    posted = [];
    const port = {
      postMessage(message) {
        posted.push(message);
        // Model an immediate host acknowledgement, which redraws the selection pill.
        if (message.type === 'node-select') setSelectedNode(message.payload.node);
      },
    };
    setupNodeSelection({ port });
    cleanup = installClickForwarding({ getPort: () => port });
  });

  afterEach(() => {
    cleanup();
    setSelectedNode(null);
    document.body.innerHTML = '';
  });

  function showPill() {
    const block = document.querySelector('[data-block-index]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    return document.querySelector('.qe-selected-pill.is-hover');
  }

  function expectActivation() {
    expect(posted).to.deep.equal([
      { type: 'quick-edit-iframe-click', payload: { target: undefined, source: 'ew-wysiwyg-layout' } },
      { type: 'node-select', payload: { node: { anchorType: 'table', proseIndex: 50 } } },
    ]);
    expect(document.querySelector('.qe-selected-pill.is-hover')).to.equal(null);
  }

  ['.qe-pill-grip', 'span:last-child'].forEach((selector) => {
    it(`forwards one click before selecting from ${selector}`, async () => {
      const pill = showPill();
      const rect = pill.querySelector(selector).getBoundingClientRect();
      const position = [Math.round(rect.x + rect.width / 2), Math.round(rect.y + rect.height / 2)];
      const presses = [];
      document.addEventListener('mousedown', () => {
        presses.push({ connected: pill.isConnected, messages: [...posted] });
      }, { once: true });
      await sendMouse({ type: 'click', position });

      expect(presses).to.deep.equal([{ connected: true, messages: [] }]);
      expectActivation();
    });
  });

  it('selects and forwards one click for keyboard activation', async () => {
    showPill().focus();
    await sendKeys({ press: 'Enter' });
    expectActivation();
  });

  it('does not select on a secondary-button press and release', async () => {
    const pill = showPill();
    const rect = pill.getBoundingClientRect();
    await sendMouse({ type: 'click', button: 'right', position: [rect.x + 10, rect.y + 10] });
    expect(pill.isConnected).to.equal(true);
    expect(posted).to.deep.equal([]);
  });
});

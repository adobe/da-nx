import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';

import '../../../../../../blocks/shared/dialog/dialog.js';

await new Promise((resolve) => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/nx2/styles/styles.css';
  link.onload = resolve;
  document.head.append(link);
});

async function openDialog({ size } = {}) {
  const dialog = document.createElement('nx-dialog');
  if (size) dialog.size = size;
  dialog.innerHTML = '<p>Short content.</p>';
  document.body.append(dialog);
  await dialog.updateComplete;
  const panel = dialog.shadowRoot.querySelector('.panel');
  const body = dialog.shadowRoot.querySelector('.body');
  return { dialog, panel, body };
}

describe('nx-dialog size', () => {
  beforeEach(async () => {
    await setViewport({ width: 1280, height: 900 });
  });

  afterEach(async () => {
    document.querySelectorAll('nx-dialog').forEach((el) => el.remove());
    await setViewport({ width: 800, height: 600 });
  });

  it('keeps the default dialog sized to its content', async () => {
    const { dialog, panel, body } = await openDialog();

    expect(dialog.hasAttribute('size')).to.be.false;
    expect(panel.getBoundingClientRect().width).to.equal(400);
    expect(getComputedStyle(panel).position).to.equal('static');
    expect(getComputedStyle(body).display).to.equal('block');
  });

  it('reflects size and fills the large max width', async () => {
    const { dialog, panel, body } = await openDialog({ size: 'large' });

    expect(dialog.getAttribute('size')).to.equal('large');
    expect(panel.getBoundingClientRect().width).to.equal(848);
    expect(getComputedStyle(body).display).to.equal('flex');
  });

  it('lets consumers override the large max width', async () => {
    const { dialog, panel } = await openDialog({ size: 'large' });
    dialog.style.setProperty('--nx-dialog-max-width', '700px');

    expect(panel.getBoundingClientRect().width).to.equal(700);
  });

  it('clamps the large dialog to the viewport', async () => {
    await setViewport({ width: 600, height: 600 });
    const { panel } = await openDialog({ size: 'large' });

    expect(panel.getBoundingClientRect().width).to.equal(600 - 64);
  });
});

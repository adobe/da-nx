import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';

import '../../../../../nx2/blocks/shared/dialog/dialog.js';

await new Promise((resolve) => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/nx2/styles/styles.css';
  link.onload = resolve;
  document.head.append(link);
});

async function openDialog(content = '<p>Short content.</p>') {
  const dialog = document.createElement('nx-dialog');
  dialog.innerHTML = content;
  document.body.append(dialog);
  await dialog.updateComplete;
  const panel = dialog.shadowRoot.querySelector('.panel');
  const body = dialog.shadowRoot.querySelector('.body');
  const actions = dialog.shadowRoot.querySelector('.actions');
  return {
    dialog, panel, body, actions,
  };
}

describe('nx-dialog sizing', () => {
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
    expect('size' in dialog).to.be.false;
    expect(panel.getBoundingClientRect().width).to.equal(400);
    expect(getComputedStyle(panel).position).to.equal('static');
    expect(getComputedStyle(body).display).to.equal('flex');
    expect(getComputedStyle(body).flexDirection).to.equal('column');
  });

  it('lets consumers override panel width', async () => {
    const { dialog, panel } = await openDialog();
    dialog.style.setProperty('--nx-dialog-min-width', '700px');
    dialog.style.setProperty('--nx-dialog-max-width', '700px');

    expect(panel.getBoundingClientRect().width).to.equal(700);
  });

  it('clamps consumer sizing to the viewport', async () => {
    await setViewport({ width: 600, height: 600 });
    const { dialog, panel } = await openDialog();
    dialog.style.setProperty('--nx-dialog-min-width', '700px');
    dialog.style.setProperty('--nx-dialog-max-width', '700px');

    expect(panel.getBoundingClientRect().width).to.equal(600 - 64);
  });

  it('hides the actions row when no actions are assigned', async () => {
    const { actions } = await openDialog();

    expect(actions.hidden).to.be.true;
    expect(getComputedStyle(actions).display).to.equal('none');
  });

  it('shows the actions row when actions are assigned', async () => {
    const { actions } = await openDialog(`
      <p>Short content.</p>
      <button slot="actions">Confirm</button>
    `);

    expect(actions.hidden).to.be.false;
    expect(getComputedStyle(actions).display).to.equal('flex');
  });

  it('renders no close button by default', async () => {
    const { dialog } = await openDialog();

    expect(dialog.shadowRoot.querySelector('.close')).to.not.exist;
  });

  it('closes from the close button when show-close-button is set', async () => {
    const dialog = document.createElement('nx-dialog');
    dialog.toggleAttribute('show-close-button', true);
    document.body.append(dialog);
    await dialog.updateComplete;
    let closed = false;
    dialog.addEventListener('close', () => { closed = true; });

    const button = dialog.shadowRoot.querySelector('.close');
    expect(button.getAttribute('aria-label')).to.equal('Close');
    button.click();

    expect(closed).to.be.true;
    expect(dialog.shadowRoot.querySelector('dialog').open).to.be.false;
  });
});

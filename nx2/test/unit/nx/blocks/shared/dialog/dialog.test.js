import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import { setUISize } from '../../../../../../utils/ui-size.js';

import '../../../../../../blocks/shared/dialog/dialog.js';

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
  let savedSize;

  beforeEach(async () => {
    savedSize = localStorage.getItem('ui-size');
    setUISize({ size: 's' });
    await setViewport({ width: 1280, height: 900 });
  });

  afterEach(async () => {
    document.querySelectorAll('nx-dialog').forEach((el) => el.remove());
    setUISize({ size: savedSize === 'm' ? 'm' : 's' });
    if (savedSize === null) localStorage.removeItem('ui-size');
    else localStorage.setItem('ui-size', savedSize);
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

  it('scales an open dialog without resetting its content or focus', async () => {
    const { dialog, body } = await openDialog('<input autofocus><p>Unsaved content.</p>');
    dialog.title = 'Preflight';
    await dialog.updateComplete;
    const title = dialog.shadowRoot.querySelector('.title');
    const modal = dialog.shadowRoot.querySelector('dialog');
    const input = dialog.querySelector('input');
    input.value = 'Keep this draft';
    input.focus();
    expect(getComputedStyle(title).fontSize).to.equal('18px');
    expect(getComputedStyle(body).fontSize).to.equal('14px');

    setUISize({ size: 'm' });
    await dialog.updateComplete;
    expect(dialog.dataset.uiSize).to.equal('m');
    expect(getComputedStyle(title).fontSize).to.equal('20px');
    expect(getComputedStyle(body).fontSize).to.equal('16px');
    expect(getComputedStyle(dialog.querySelector('p')).lineHeight).to.equal('24px');
    expect(dialog.shadowRoot.querySelector('dialog')).to.equal(modal);
    expect(modal.open).to.be.true;
    expect(input.value).to.equal('Keep this draft');
    expect(document.activeElement).to.equal(input);

    setUISize({ size: 's' });
    await dialog.updateComplete;
    expect(getComputedStyle(title).fontSize).to.equal('18px');
    expect(getComputedStyle(body).fontSize).to.equal('14px');
    expect(getComputedStyle(dialog.querySelector('p')).lineHeight).to.equal('21px');
  });

  it('starts in M and releases its size listener on disconnect', async () => {
    setUISize({ size: 'm' });
    const { dialog, body } = await openDialog();
    expect(dialog.dataset.uiSize).to.equal('m');
    expect(getComputedStyle(body).fontSize).to.equal('16px');
    dialog.remove();
    setUISize({ size: 's' });
    expect(dialog.dataset.uiSize).to.equal('m');
  });
});

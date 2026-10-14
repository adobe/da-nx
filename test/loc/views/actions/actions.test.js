import { expect } from '@esm-bundle/chai';
import '../../../../nx/blocks/loc/views/actions/actions.js';

async function renderActions(props) {
  const el = document.createElement('nx-loc-actions');
  el.project = { view: 'validate', urls: [] };
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const nextButton = (el) => el.shadowRoot.querySelector('.nx-next');

describe('nx-loc-actions next button', () => {
  afterEach(() => {
    document.querySelectorAll('nx-loc-actions').forEach((el) => el.remove());
  });

  it('is enabled by default', async () => {
    const el = await renderActions();
    expect(nextButton(el).disabled).to.be.false;
  });

  it('is disabled when nextDisabled is set', async () => {
    const el = await renderActions({ nextDisabled: true });
    expect(nextButton(el).disabled).to.be.true;
  });

  it('re-enables when nextDisabled is cleared', async () => {
    const el = await renderActions({ nextDisabled: true });
    el.nextDisabled = false;
    await el.updateComplete;
    expect(nextButton(el).disabled).to.be.false;
  });
});

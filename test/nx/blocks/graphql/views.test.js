import { expect } from '@esm-bundle/chai';
import '../../../../nx/blocks/graphql/shared/site-picker/site-picker.js';

const mount = async (tag, props) => {
  const el = Object.assign(document.createElement(tag), props);
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const waitFor = async (check, tries = 50) => {
  for (let i = 0; i < tries && !check(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  expect(check()).to.be.ok;
};

const nextEvent = (el, type) => new Promise((resolve) => {
  el.addEventListener(type, resolve, { once: true });
});

describe('views', () => {
  afterEach(() => document.body.replaceChildren());

  it('asks for org and site in a dialog and emits site changes', async () => {
    const el = await mount('nx-site-picker', { org: 'Adobe' });
    await waitFor(() => el.shadowRoot.querySelector('nx-dialog'));
    expect(el.shadowRoot.querySelector('nx-dialog').title).to.equal('Choose a site');
    const inputs = [...el.shadowRoot.querySelectorAll('input.nx-input')];
    expect(inputs.map((input) => input.value)).to.deep.equal(['Adobe', '']);
    inputs[1].value = ' My-Site ';

    const changed = nextEvent(el, 'site-change');
    el.shadowRoot.querySelector('nx-dialog .nx-form-btn-primary').click();
    const { detail } = await changed;
    expect(detail).to.deep.equal({ org: 'adobe', site: 'my-site' });
  });

  it('validates the site fields only on submit', async () => {
    const el = await mount('nx-site-picker', { org: 'adobe' });
    await waitFor(() => el.shadowRoot.querySelector('nx-dialog'));
    const root = el.shadowRoot;
    expect(root.querySelector('.nx-input-error-msg')).to.equal(null);

    let changes = 0;
    el.addEventListener('site-change', () => { changes += 1; });
    root.querySelector('nx-dialog .nx-form-btn-primary').click();
    await el.updateComplete;
    const errors = [...root.querySelectorAll('.nx-input-error-msg')];
    expect(errors.map((e) => e.textContent)).to.deep.equal(['A site name is required.']);
    expect(changes).to.equal(0);

    const site = root.querySelector('input[name="site"]');
    site.value = 'x';
    site.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(root.querySelector('.nx-input-error-msg')).to.equal(null);
  });

  it('reports a cancel when no site is chosen yet', async () => {
    const el = await mount('nx-site-picker', {});
    await waitFor(() => el.shadowRoot.querySelector('nx-dialog'));

    const cancelled = nextEvent(el, 'site-cancel');
    el.shadowRoot.querySelector('nx-dialog .nx-form-btn-secondary').click();
    await cancelled;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
  });

  it('changes the current site and reports a cancel', async () => {
    const el = await mount('nx-site-picker', { org: 'o', site: 's' });
    await waitFor(() => el.shadowRoot.querySelector('nx-dialog'));
    expect(el.shadowRoot.querySelector('nx-dialog').title).to.equal('Change site');
    const inputs = [...el.shadowRoot.querySelectorAll('input.nx-input')];
    expect(inputs.map((input) => input.value)).to.deep.equal(['o', 's']);

    const cancelled = nextEvent(el, 'site-cancel');
    el.shadowRoot.querySelector('nx-dialog .nx-form-btn-primary').click();
    await cancelled;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
  });
});

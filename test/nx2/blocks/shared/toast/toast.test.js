import { expect } from '@esm-bundle/chai';
import {
  showToast,
  VARIANT_SUCCESS,
  VARIANT_ERROR,
  VARIANT_WARNING,
} from '../../../../../nx2/blocks/shared/toast/toast.js';

const HOST_SELECTOR = '#nx-toast-host';
const getHost = () => document.querySelector(HOST_SELECTOR);
const getToast = () => document.querySelector('nx-toast');

async function toastFor(opts) {
  showToast(opts);
  const toast = getToast();
  await toast.updateComplete;
  return toast;
}

describe('showToast', () => {
  afterEach(() => {
    getHost()?.remove();
  });

  it('creates the host region and appends an nx-toast', async () => {
    const toast = await toastFor({ text: 'Saved' });
    const host = getHost();
    expect(host).to.exist;
    expect(host.getAttribute('role')).to.equal('region');
    expect(host.getAttribute('aria-label')).to.equal('Notifications');
    expect(toast).to.exist;
    expect(toast.message).to.equal('Saved');
  });

  it('is a no-op when text is missing, empty, or whitespace-only', () => {
    showToast({ text: '' });
    showToast({ text: '   ' });
    showToast({});
    expect(getToast()).to.be.null;
  });

  it('trims surrounding whitespace from the text', async () => {
    const toast = await toastFor({ text: '  Saved  ' });
    expect(toast.message).to.equal('Saved');
    expect(toast.shadowRoot.querySelector('.text').textContent).to.equal('Saved');
  });

  it('defaults to the success variant', async () => {
    const toast = await toastFor({ text: 'Saved' });
    const inner = toast.shadowRoot.querySelector('.toast');
    expect(inner.classList.contains(`toast-${VARIANT_SUCCESS}`)).to.be.true;
    expect(inner.getAttribute('role')).to.equal('status');
  });

  it('applies the error variant class and role="alert"', async () => {
    const toast = await toastFor({ text: 'Boom', variant: VARIANT_ERROR });
    const inner = toast.shadowRoot.querySelector('.toast');
    expect(inner.classList.contains(`toast-${VARIANT_ERROR}`)).to.be.true;
    expect(inner.getAttribute('role')).to.equal('alert');
  });

  it('applies the warning variant class and role="alert"', async () => {
    const toast = await toastFor({ text: 'Careful', variant: VARIANT_WARNING });
    const inner = toast.shadowRoot.querySelector('.toast');
    expect(inner.classList.contains(`toast-${VARIANT_WARNING}`)).to.be.true;
    expect(inner.getAttribute('role')).to.equal('alert');
  });

  it('falls back to the success variant for unknown values', async () => {
    const toast = await toastFor({ text: 'Saved', variant: 'bogus' });
    expect(toast.variant).to.equal(VARIANT_SUCCESS);
    const inner = toast.shadowRoot.querySelector('.toast');
    expect(inner.classList.contains(`toast-${VARIANT_SUCCESS}`)).to.be.true;
  });

  it('renders a CTA link when cta.href and cta.text are provided', async () => {
    const toast = await toastFor({
      text: 'Saved',
      cta: { href: '/next', text: 'View' },
    });
    const cta = toast.shadowRoot.querySelector('a.cta');
    expect(cta).to.exist;
    expect(cta.getAttribute('href')).to.equal('/next');
    expect(cta.textContent).to.equal('View');
  });

  it('does not render a CTA when omitted', async () => {
    const toast = await toastFor({ text: 'Saved' });
    expect(toast.shadowRoot.querySelector('a.cta')).to.be.null;
  });

  it('dismisses the toast when the close button is clicked', async () => {
    const toast = await toastFor({ text: 'Saved' });
    toast.shadowRoot.querySelector('button.close').click();
    expect(getToast()).to.be.null;
  });

  it('sets --nx-toast-max-width as an inline style when maxWidth is passed', async () => {
    const toast = await toastFor({ text: 'Saved', maxWidth: '320px' });
    expect(toast.style.getPropertyValue('--nx-toast-max-width')).to.equal('320px');
  });
});

describe('toast stacking', () => {
  let toolbar;

  beforeEach(() => {
    toolbar = document.createElement('div');
    toolbar.style.cssText = 'position: fixed; inset: 0; margin: 0; width: auto; height: auto; z-index: 100; background: white;';
    document.body.append(toolbar);
  });

  afterEach(() => {
    toolbar.remove();
    getHost()?.remove();
  });

  async function expectToastInFront() {
    const toast = document.querySelector('nx-toast:last-child');
    await toast.updateComplete;
    const { left, top, width, height } = toast.getBoundingClientRect();
    expect(width).to.be.greaterThan(0);
    expect(height).to.be.greaterThan(0);
    expect(document.elementFromPoint(left + width / 2, top + height / 2)).to.equal(toast);
  }

  it('renders above a fixed toolbar', async () => {
    showToast({ text: 'Upload failed', variant: VARIANT_ERROR });
    await expectToastInFront();
  });

  it('renders above a top-layer toolbar without closing it or moving focus', async () => {
    toolbar.popover = 'auto';
    const button = document.createElement('button');
    button.textContent = 'Add image';
    toolbar.append(button);
    toolbar.showPopover();
    button.focus();

    showToast({ text: 'Max image size allowed is 20 MB', variant: VARIANT_ERROR });

    await expectToastInFront();
    expect(toolbar.matches(':popover-open')).to.be.true;
    expect(document.activeElement).to.equal(button);
  });

  it('raises an existing toast stack above a subsequently opened toolbar', async () => {
    showToast({ text: 'Saved', timeout: null });
    toolbar.popover = 'manual';
    toolbar.showPopover();

    showToast({ text: 'Upload failed', variant: VARIANT_ERROR });

    await expectToastInFront();
    expect(document.querySelectorAll('nx-toast')).to.have.length(2);
    expect(toolbar.matches(':popover-open')).to.be.true;
  });
});

import { expect } from '@esm-bundle/chai';
import '../../../../../../blocks/shared/link-dialog/link-dialog.js';

async function mount(props = {}) {
  const el = document.createElement('nx-link-dialog');
  Object.assign(el, { open: true, ...props });
  document.body.append(el);
  await el.updateComplete;
  const dialog = el.shadowRoot.querySelector('nx-dialog');
  await dialog?.updateComplete;
  return el;
}

const field = (el, name) => el.shadowRoot.querySelector(`[name="${name}"]`);
const button = (el, label) => [...el.shadowRoot.querySelectorAll('button')]
  .find((b) => b.textContent.trim() === label);

function submitted(el) {
  const events = [];
  el.addEventListener('nx-link-submit', (e) => events.push(e.detail));
  return events;
}

describe('nx-link-dialog', () => {
  afterEach(() => {
    document.querySelectorAll('nx-link-dialog').forEach((el) => el.remove());
  });

  it('renders nothing while closed', async () => {
    const el = await mount({ open: false });
    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
  });

  it('prefills the fields and submits them', async () => {
    const el = await mount({ href: '/a', text: 'A' });
    const events = submitted(el);
    expect(el.shadowRoot.querySelector('nx-dialog').title).to.equal('Edit link');
    expect(field(el, 'link-title')).to.equal(null);
    field(el, 'link-href').value = ' https://x.y ';
    field(el, 'link-text').value = 'X';
    button(el, 'Save').click();
    expect(events).to.deep.equal([{ href: 'https://x.y', text: 'X' }]);
  });

  it('includes the title when shown', async () => {
    const el = await mount({ showTitle: true, anchorTitle: 'T', href: '/a' });
    const events = submitted(el);
    expect(field(el, 'link-title').value).to.equal('T');
    button(el, 'Save').click();
    expect(events[0].title).to.equal('T');
  });

  it('submits on Enter', async () => {
    const el = await mount({ href: '/a' });
    const events = submitted(el);
    field(el, 'link-href').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    expect(events).to.have.length(1);
  });

  it('rejects empty and script URLs by default', async () => {
    const el = await mount();
    const events = submitted(el);
    button(el, 'Save').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.nx-input-error-msg').textContent).to.equal('URL is required');
    field(el, 'link-href').value = ['javascript', 'alert(1)'].join(':');
    button(el, 'Save').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.nx-input-error-msg').textContent).to.equal('Invalid URL protocol');
    expect(field(el, 'link-href').getAttribute('aria-invalid')).to.equal('true');
    expect(events).to.have.length(0);
  });

  it('uses a custom validator', async () => {
    const el = await mount({ href: 'ftp://x', validate: (href) => (href.startsWith('ftp:') ? 'No FTP' : '') });
    const events = submitted(el);
    button(el, 'Save').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.nx-input-error-msg').textContent).to.equal('No FTP');
    expect(events).to.have.length(0);
  });

  it('closes on cancel', async () => {
    const el = await mount({ href: '/a' });
    let closed = false;
    el.addEventListener('close', () => { closed = true; });
    button(el, 'Cancel').click();
    expect(closed).to.be.true;
  });
});

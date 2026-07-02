import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';

// fragment.js (a transitive dependency of feedback.js) captures getConfig()
// into a module-level constant at import time, so setConfig() must resolve
// before feedback.js is ever imported — a static import would evaluate (and
// freeze that constant) before this file's own top-level code could run.
await setConfig({ hostnames: [] });
const { attachFeedbackMenu, parseFeedbackItems } = await import('../../../../../blocks/feedback/feedback.js');

const FEEDBACK_FRAGMENT_HTML = `
  <div>
    <p><a href="#idea"><span class="icon icon-idea"></span>Submit an idea</a><br><em>Suggestions and feature requests</em></p>
    <p><a href="#bug"><span class="icon icon-bug"></span>Report a bug</a><br><em>Problems using AEM</em></p>
    <p><a href="https://discord.gg/X8D9JhyDX"><span class="icon icon-discord"></span>Join our Discord Server</a><br><em>Discussion forum</em></p>
  </div>
`;

function buildFragment(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.firstElementChild;
}

describe('parseFeedbackItems', () => {
  it('parses each row into an item with id, label, description, icon, and href', () => {
    const items = parseFeedbackItems(buildFragment(FEEDBACK_FRAGMENT_HTML));
    expect(items).to.have.lengthOf(3);
    expect(items[0]).to.deep.equal({
      id: 'idea',
      label: 'Submit an idea',
      description: 'Suggestions and feature requests',
      icon: 'idea',
      href: '#idea',
    });
    expect(items[1]).to.deep.equal({
      id: 'bug',
      label: 'Report a bug',
      description: 'Problems using AEM',
      icon: 'bug',
      href: '#bug',
    });
  });

  it('uses the icon name as id for external links (no hash)', () => {
    const items = parseFeedbackItems(buildFragment(FEEDBACK_FRAGMENT_HTML));
    expect(items[2]).to.deep.equal({
      id: 'discord',
      label: 'Join our Discord Server',
      description: 'Discussion forum',
      icon: 'discord',
      href: 'https://discord.gg/X8D9JhyDX',
    });
  });

  it('falls back to a positional id when there is no icon and no hash href', () => {
    const items = parseFeedbackItems(buildFragment(`
      <div><p><a href="https://example.com">No icon link</a></p></div>
    `));
    expect(items).to.deep.equal([{
      id: 'link-0',
      label: 'No icon link',
      description: undefined,
      icon: undefined,
      href: 'https://example.com',
    }]);
  });

  it('skips rows without a link', () => {
    const items = parseFeedbackItems(buildFragment('<div><p>No link here</p></div>'));
    expect(items).to.deep.equal([]);
  });

  it('omits description when there is no <em>', () => {
    const items = parseFeedbackItems(buildFragment(`
      <div><p><a href="#idea"><span class="icon icon-idea"></span>Submit an idea</a></p></div>
    `));
    expect(items[0].description).to.be.undefined;
  });
});

// Matches the shape blocks/dialog/dialog.js produces from a generic
// hash-linked fragment anchor — the same shape Help's button has, since
// Feedback is no longer distinguished by any linkBlocks config, only by
// nav.js's decorateActions checking dataset.pathname.
function buildTriggerButton({ pathname = '/fragments/nav/feedback' } = {}) {
  const button = document.createElement('button');
  button.className = 'nx-dialog auto-block';
  button.dataset.pathname = pathname;
  button.innerHTML = '<span class="icon icon-feedback"></span>Feedback';
  document.body.append(button);
  return button;
}

describe('attachFeedbackMenu', () => {
  afterEach(() => {
    document.querySelectorAll('button, nx-feedback-menu').forEach((el) => el.remove());
  });

  it('wraps the button in a nx-feedback-menu, keeping it as the trigger slot', () => {
    const button = buildTriggerButton();
    attachFeedbackMenu(button);

    const wrapper = document.querySelector('nx-feedback-menu');
    expect(wrapper).to.not.be.null;

    const trigger = wrapper.querySelector('button[slot="trigger"]');
    expect(trigger).to.equal(button);
    expect(trigger.classList.contains('nx-feedback')).to.be.true;
    expect(trigger.dataset.pathname).to.equal('/fragments/nav/feedback');
    expect(trigger.querySelector('span.icon.icon-feedback')).to.not.be.null;
    expect(trigger.textContent.trim()).to.equal('Feedback');
  });

  it('sets the wrapper path from the button dataset.pathname', () => {
    const button = buildTriggerButton();
    attachFeedbackMenu(button);
    const wrapper = document.querySelector('nx-feedback-menu');
    expect(wrapper.path).to.equal('/fragments/nav/feedback');
  });
});

function mockFeedbackFragmentFetch(html = FEEDBACK_FRAGMENT_HTML) {
  // html is already a single top-level <div>...</div> (the authored fragment
  // shape) — that div itself becomes the one `main > div` section loadFragment()
  // looks for, matching real /fragments/nav/feedback content.
  const originalFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/fragments/nav/feedback')) {
      return new Response(`<html><body><main>${html}</main></body></html>`, {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/html' }),
      });
    }
    return originalFetch.call(window, url, opts);
  };
  return () => { window.fetch = originalFetch; };
}

describe('NxFeedbackMenu', () => {
  let restoreFetch;

  afterEach(() => {
    restoreFetch?.();
    document.querySelectorAll('button, nx-feedback-menu').forEach((el) => el.remove());
  });

  it('loads and parses items from the fragment on connect', async () => {
    restoreFetch = mockFeedbackFragmentFetch();
    const button = buildTriggerButton();
    attachFeedbackMenu(button);
    const wrapper = document.querySelector('nx-feedback-menu');
    await wrapper.updateComplete;
    await new Promise((r) => { setTimeout(r, 50); });
    await wrapper.updateComplete;

    expect(wrapper._items).to.have.lengthOf(3);
    expect(wrapper._items[0].id).to.equal('idea');
  });

  it('opens a dialog for a hash-href item on select', async () => {
    restoreFetch = mockFeedbackFragmentFetch();
    const button = buildTriggerButton();
    attachFeedbackMenu(button);
    const wrapper = document.querySelector('nx-feedback-menu');
    await wrapper.updateComplete;
    await new Promise((r) => { setTimeout(r, 50); });
    await wrapper.updateComplete;

    await wrapper._handleSelect({ detail: { id: 'idea' } });
    await wrapper.updateComplete;

    expect(wrapper._dialog).to.deep.equal({ id: 'idea', titleText: 'Submit an idea' });
    const dialog = wrapper.shadowRoot.querySelector('nx-dialog');
    expect(dialog).to.not.be.null;
    expect(dialog.getAttribute('title')).to.equal('Submit an idea');
  });

  it('opens an external link in a new tab on select instead of a dialog', async () => {
    restoreFetch = mockFeedbackFragmentFetch();
    const button = buildTriggerButton();
    attachFeedbackMenu(button);
    const wrapper = document.querySelector('nx-feedback-menu');
    await wrapper.updateComplete;
    await new Promise((r) => { setTimeout(r, 50); });
    await wrapper.updateComplete;

    const openStub = sinon.stub(window, 'open');
    await wrapper._handleSelect({ detail: { id: 'discord' } });

    expect(openStub.calledOnceWith('https://discord.gg/X8D9JhyDX', '_blank', 'noopener,noreferrer')).to.be.true;
    expect(wrapper._dialog).to.be.undefined;
    openStub.restore();
  });

  it('closes the dialog and clears state on submit (no network call)', async () => {
    restoreFetch = mockFeedbackFragmentFetch();
    const button = buildTriggerButton();
    attachFeedbackMenu(button);
    const wrapper = document.querySelector('nx-feedback-menu');
    await wrapper.updateComplete;
    await new Promise((r) => { setTimeout(r, 50); });
    await wrapper.updateComplete;

    await wrapper._handleSelect({ detail: { id: 'bug' } });
    await wrapper.updateComplete;
    expect(wrapper._dialog).to.not.be.undefined;

    wrapper._submitDialog();
    expect(wrapper._dialog).to.be.undefined;
  });
});

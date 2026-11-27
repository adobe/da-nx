import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../nx2/scripts/nx.js';

// help-and-feedback.js captures getConfig() into a module-level constant at import
// time (for ICON_HREF), so setConfig() must resolve before help-and-feedback.js is
// ever imported — a static import would evaluate (and freeze that constant)
// before this file's own top-level code could run.
await setConfig({ hostnames: [] });
const { parseHelpAndFeedbackItems } = await import('../../../../nx2/blocks/help-and-feedback/help-and-feedback.js');

const FEEDBACK_FRAGMENT_HTML = `
  <div>
    <p><a href="#idea"><span class="icon icon-idea"></span>Submit an idea</a><br><em>Suggestions and feature requests</em></p>
    <p><a href="#bug"><span class="icon icon-bug"></span>Report a bug</a><br><em>Problems using AEM</em></p>
    <p><a href="https://discord.gg/X8D9JhyDX"><span class="icon icon-discord"></span>Join our Discord Server</a><br><em>Discussion forum</em></p>
  </div>
`;

const SUPPORT_FRAGMENT_HTML = `
  <div><p><a href="#whatsnew"><span class="icon icon-gift"></span>Explore what's new</a></p></div>
  ${FEEDBACK_FRAGMENT_HTML}
  <div>
    <p><a href="https://www.aem.live/docs/ew/about">Resources</a></p>
    <p><a href="#legal">Legal notices</a></p>
  </div>
`;

function buildFragment(html) {
  const fragment = document.createElement('div');
  fragment.innerHTML = html;
  return fragment;
}

describe('parseHelpAndFeedbackItems', () => {
  it('parses each row into an item with id, label, description, icon, and href', () => {
    const items = parseHelpAndFeedbackItems(buildFragment(FEEDBACK_FRAGMENT_HTML));
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
    const items = parseHelpAndFeedbackItems(buildFragment(FEEDBACK_FRAGMENT_HTML));
    expect(items[2]).to.deep.equal({
      id: 'discord',
      label: 'Join our Discord Server',
      description: 'Discussion forum',
      icon: 'discord',
      href: 'https://discord.gg/X8D9JhyDX',
    });
  });

  it('falls back to a positional id when there is no icon and no hash href', () => {
    const items = parseHelpAndFeedbackItems(buildFragment(`
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
    const items = parseHelpAndFeedbackItems(buildFragment('<div><p>No link here</p></div>'));
    expect(items).to.deep.equal([]);
  });

  it('uses authored sections and rules as dividers without empty groups', () => {
    const items = parseHelpAndFeedbackItems(buildFragment(`
      <hr><div><p>Introduction</p></div>
      <div><p><a href="#legal">Legal first</a></p><hr><hr>
      <p><a href="#idea">Idea next</a></p></div>
      <div><p>No link</p></div>
      <div><p><a href="/help">Help last</a></p></div><hr>
    `));
    expect(items.map((item) => item.divider || item.label))
      .to.deep.equal(['Legal first', true, 'Idea next', true, 'Help last']);
  });
});

describe('help and feedback menu', () => {
  let el;
  let originalFetch;
  let originalOpen;
  let fragmentHtml;

  beforeEach(async () => {
    originalFetch = window.fetch;
    originalOpen = window.open;
    fragmentHtml = SUPPORT_FRAGMENT_HTML;
    window.fetch = async (url, options) => {
      if (String(url) === '/fragments/nav/help-and-feedback') {
        return new Response(`<main>${fragmentHtml}</main>`);
      }
      if (String(url) === '/fragments/guides/whats-new') {
        return new Response(`<head><meta name="published-date" content="2099-01-01"></head>
          <main><div><h3 id="feature">New feature</h3><p>Feature description</p></div></main>`);
      }
      if (String(url) === '/fragments/nav/help') {
        return new Response('<main><div><p>Legal notice content</p></div></main>');
      }
      return originalFetch.call(window, url, options);
    };
    el = document.createElement('nx-help-and-feedback');
    const loadItems = sinon.spy(el, '_loadItems');
    const checkUnseen = sinon.spy(el, '_checkUnseen');
    document.body.append(el);
    await Promise.all([loadItems.firstCall.returnValue, checkUnseen.firstCall.returnValue]);
    await el.updateComplete;
  });

  afterEach(() => {
    sinon.restore();
    window.fetch = originalFetch;
    window.open = originalOpen;
    el.remove();
    document.querySelectorAll('nx-dialog, nx-whatsnew-dialog, nx-feedback-dialog')
      .forEach((dialog) => dialog.remove());
  });

  it('uses a lightbulb and renders the items and groups authored in the fragment', async () => {
    const trigger = el.shadowRoot.querySelector('button');
    expect(trigger.getAttribute('aria-label')).to.equal('Help and feedback');
    expect(trigger.querySelector('use').getAttribute('href')).to.include('Lightbulb');
    const menu = el.shadowRoot.querySelector('nx-menu');
    await menu.updateComplete;
    expect(menu.items.filter((item) => !item.divider).map((item) => item.label)).to.deep.equal([
      "Explore what's new", 'Submit an idea', 'Report a bug', 'Join our Discord Server',
      'Resources', 'Legal notices',
    ]);
    expect(menu.shadowRoot.querySelectorAll('[role="separator"]')).to.have.lengthOf(2);
  });

  it('hides the trigger while loading and shows it when items arrive', async () => {
    const { fetch } = window;
    let resolveFetch;
    window.fetch = () => new Promise((resolve) => { resolveFetch = resolve; });
    const loading = el._loadItems();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-menu, button')).to.be.null;
    resolveFetch(new Response(`<main>${SUPPORT_FRAGMENT_HTML}</main>`));
    await loading;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('button[slot="trigger"]')).to.exist;
    window.fetch = fetch;
  });

  [
    { name: 'the fragment is missing', response: () => new Response('Not found', { status: 404 }) },
    { name: 'the fragment is empty', response: () => new Response('<main></main>') },
    {
      name: 'the fragment has no usable links',
      response: () => new Response('<main><p><a>No URL</a></p><p><a href="/help"></a></p></main>'),
    },
    {
      name: 'the request fails',
      response: () => { throw new TypeError('Network unavailable'); },
    },
  ].forEach(({ name, response }) => {
    it(`hides the trigger when ${name}, including after previously loading items`, async () => {
      window.fetch = async () => response();
      await el._loadItems();
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('nx-menu, button')).to.be.null;
    });
  });

  it('does not inject removed items and preserves authored labels, icons, links and order', async () => {
    fragmentHtml = `<div>
      <p><a href="/help"><span class="icon icon-help"></span>Get support</a></p>
      <p><a href="#idea">Share a suggestion</a></p>
    </div>`;
    await el._loadItems();
    await el.updateComplete;
    const menu = el.shadowRoot.querySelector('nx-menu');
    expect(menu.items.map((item) => item.label))
      .to.deep.equal(['Get support', 'Share a suggestion']);
    expect(menu.items[0].icon).to.equal('help');
    const opened = [];
    window.open = (...args) => { opened.push(args); };
    await el._handleSelect({ detail: { id: 'help' } });
    await el._handleSelect({ detail: { id: 'legal' } });
    expect(opened).to.deep.equal([['/help', '_blank', 'noopener,noreferrer']]);
    expect(document.querySelector('nx-dialog, nx-feedback-dialog')).to.be.null;
  });

  it('opens Resources and Discord externally without opening feedback dialogs', async () => {
    const opened = [];
    window.open = (...args) => { opened.push(args); };
    const resources = el._items.find((item) => item.label === 'Resources');
    await el._handleSelect({ detail: { id: resources.id } });
    await el._handleSelect({ detail: { id: 'discord' } });
    expect(opened).to.deep.equal([
      ['https://www.aem.live/docs/ew/about', '_blank', 'noopener,noreferrer'],
      ['https://discord.gg/X8D9JhyDX', '_blank', 'noopener,noreferrer'],
    ]);
    expect(document.querySelector('nx-feedback-dialog')).to.be.null;
  });

  it('does not treat an external hash as an internal modal action', async () => {
    fragmentHtml = '<p><a href="https://example.com/#legal">External legal</a></p>';
    await el._loadItems();
    const opened = [];
    window.open = (...args) => { opened.push(args); };
    await el._handleSelect({ detail: { id: 'legal' } });
    expect(opened).to.deep.equal([['https://example.com/#legal', '_blank', 'noopener,noreferrer']]);
    expect(document.querySelector('nx-dialog')).to.be.null;
  });

  it('keeps idea and bug actions opening their existing feedback dialogs', async () => {
    for (const id of ['idea', 'bug']) {
      await el._handleSelect({ detail: { id } });
      const dialog = document.querySelector('nx-feedback-dialog');
      expect(dialog.kind).to.equal(id);
      dialog.remove();
    }
  });

  it('opens a single whats-new modal and clears its indicator on close', async () => {
    el._hasUnseen = true;
    await el.updateComplete;
    const menu = el.shadowRoot.querySelector('nx-menu');
    await menu.updateComplete;
    expect(menu.shadowRoot.querySelector('.menu-item-status-dot')).to.exist;
    await import('../../../../nx2/blocks/whatsnew/whatsnew-dialog.js');
    const loadContent = sinon.spy(customElements.get('nx-whatsnew-dialog').prototype, '_loadContent');
    await el._handleSelect({ detail: { id: 'whatsnew' } });
    await loadContent.firstCall.returnValue;
    await el._handleSelect({ detail: { id: 'whatsnew' } });
    expect(document.querySelectorAll('nx-whatsnew-dialog')).to.have.lengthOf(1);
    const dialog = document.querySelector('nx-whatsnew-dialog');
    await dialog.updateComplete;
    await dialog._dialog.updateComplete;
    dialog.close();
    await el.updateComplete;
    expect(el._hasUnseen).to.equal(false);
    await menu.updateComplete;
    expect(menu.shadowRoot.querySelector('.menu-item-status-dot')).to.be.null;
  });

  it('opens legal notices in the shared modal', async () => {
    await el._handleSelect({ detail: { id: 'legal' } });
    const dialog = document.querySelector('nx-dialog');
    expect(dialog.textContent).to.include('Legal notice content');
  });

  it('recognizes path-qualified authored modal links', async () => {
    fragmentHtml = `<div>
      <p><a href="/fragments/nav/help">Policies</a></p>
      <p><a href="/canvas#bug">Something broke</a></p>
    </div>`;
    await el._loadItems();
    await el._handleSelect({ detail: { id: el._items[0].id } });
    expect(document.querySelector('nx-dialog').textContent).to.include('Legal notice content');
    await el._handleSelect({ detail: { id: 'bug' } });
    expect(document.querySelector('nx-feedback-dialog').kind).to.equal('bug');
  });
});

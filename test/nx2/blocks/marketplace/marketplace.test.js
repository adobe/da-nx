import { expect } from '@esm-bundle/chai';
import init from '../../../../nx2/blocks/marketplace/marketplace.js';
import { MARKETPLACE_PATH } from '../../../../nx2/blocks/marketplace/marketplace-utils.js';

function installFetch(handler) {
  const origFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const { pathname } = new URL(String(url), window.location.origin);
    if (pathname === MARKETPLACE_PATH) return handler(url, opts);
    return origFetch(url, opts);
  };
  return () => { window.fetch = origFetch; };
}

function jsonResponse(body, init2 = {}) {
  return new Response(JSON.stringify(body), { status: 200, ...init2 });
}

async function waitForLoad(el) {
  for (let i = 0; i < 50; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await el.updateComplete;
    if (el._items !== undefined || el._error) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  await el.updateComplete;
}

async function waitFor(check) {
  for (let i = 0; i < 50 && !check(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
}

describe('nx-marketplace', () => {
  let div;
  let restoreFetch;

  afterEach(() => {
    div?.remove();
    restoreFetch?.();
  });

  it('init mounts nx-marketplace', () => {
    restoreFetch = installFetch(() => jsonResponse({ data: [] }));
    div = document.createElement('div');
    div.innerHTML = '<p>prior content</p>';
    document.body.append(div);

    init(div);

    expect(div.children.length).to.equal(1);
    expect(div.firstElementChild.localName).to.equal('nx-marketplace');
  });

  it('shows loading state before data resolves', async () => {
    restoreFetch = installFetch(() => new Promise(() => {}));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.loading') !== null).to.equal(true);
    expect(el.shadowRoot.querySelector('.card:not(.skeleton)') === null).to.equal(true);
  });

  it('renders a card per valid row', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'DA Permissions', Description: 'Manage permissions', 'Doc Url': 'https://example.com/a' },
        { Title: '', Description: 'No title', 'Doc Url': 'https://example.com/b' },
        { Title: 'Second Item', Description: 'Second', 'Doc Url': 'https://example.com/c' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const cards = el.shadowRoot.querySelectorAll('.card');
    expect(cards.length).to.equal(2);
    expect(cards[0].querySelector('h3').textContent).to.equal('DA Permissions');
  });

  it('shows the Adobe logo as icon only for Adobe-owned items without an icon', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'Adobe Item', Description: 'd', 'Doc Url': 'https://example.com/a', Owner: 'Adobe',
        },
        {
          Title: 'Partner Item', Description: 'd', 'Doc Url': 'https://example.com/b', Owner: 'Acme',
        },
        {
          Title: 'Adobe With Icon', 'Doc Url': 'https://example.com/c', Owner: 'Adobe', Icon: 'https://example.com/i.png',
        },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);
    await waitFor(() => el.shadowRoot.querySelector('.adobe-logo svg'));

    const cards = [...el.shadowRoot.querySelectorAll('.card')];
    const logo = cards[0].querySelector('.card-icon.adobe-logo');
    expect(logo.getAttribute('aria-label')).to.equal('Adobe');
    expect(logo.querySelectorAll('svg').length).to.equal(1);
    expect(cards[1].querySelector('.adobe-logo') === null).to.equal(true);
    expect(cards[1].querySelector('.card-icon.placeholder') !== null).to.equal(true);
    expect(cards[2].querySelector('.adobe-logo') === null).to.equal(true);
    expect(cards[2].querySelector('img.card-icon').src).to.equal('https://example.com/i.png');
  });

  it('renders icon or placeholder', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'Has Icon', Description: 'd', 'Doc Url': 'https://example.com/a', Icon: 'https://example.com/t.png',
        },
        {
          Title: 'No Icon', Description: 'd', 'Doc Url': 'https://example.com/b', Icon: '',
        },
        {
          // eslint-disable-next-line no-script-url
          Title: 'Unsafe Icon', Description: 'd', 'Doc Url': 'https://example.com/c', Icon: 'javascript:x',
        },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const cards = el.shadowRoot.querySelectorAll('.card');

    const img0 = cards[0].querySelector('img.card-icon');
    expect(img0.src).to.equal('https://example.com/t.png');
    expect(img0.alt).to.equal('');
    expect(img0.loading).to.equal('lazy');
    expect(cards[0].querySelector('.placeholder') === null).to.equal(true);

    expect(cards[1].querySelector('img') === null).to.equal(true);
    expect(cards[1].querySelector('.placeholder') !== null).to.equal(true);

    expect(cards[2].querySelector('img') === null).to.equal(true);
    expect(cards[2].querySelector('.placeholder') !== null).to.equal(true);
  });

  it('falls back to placeholder when the icon fails to load', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'Has Icon', Description: 'd', 'Doc Url': 'https://example.com/a', Icon: 'https://example.com/t.png',
        },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const card = el.shadowRoot.querySelector('.card');
    card.querySelector('img').dispatchEvent(new Event('error'));
    await el.updateComplete;

    expect(card.querySelector('img') === null).to.equal(true);
    expect(card.querySelector('.placeholder') !== null).to.equal(true);
  });

  it('puts all actions in a per-card menu and the card itself has no links', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'DA Permissions', Description: 'd', 'Doc Url': 'https://example.com/a', 'Try Url': 'https://example.com/try',
        },
        { Title: 'Try Only', Description: 'd', 'Try Url': 'https://example.com/try2' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const [full, tryOnly] = el.shadowRoot.querySelectorAll('.card');
    expect(full.querySelectorAll('a').length).to.equal(0);

    const menu = full.querySelector('nx-menu');
    expect(menu.items.map(({ id, label, href }) => ({ id, label, href }))).to.deep.equal([
      { id: 'learn', label: 'Learn more', href: 'https://example.com/a' },
      { id: 'try', label: 'Try out', href: 'https://example.com/try' },
    ]);
    const trigger = menu.querySelector('button[slot="trigger"]');
    expect(trigger.getAttribute('aria-label')).to.equal('More actions for DA Permissions');

    expect(tryOnly.querySelector('nx-menu').items.map(({ id }) => id)).to.deep.equal(['try']);
  });

  it('opens the selected action in a new tab', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [{ Title: 'DA Permissions', 'Doc Url': 'https://example.com/a', 'Try Url': 'https://example.com/try' }],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const origOpen = window.open;
    const calls = [];
    window.open = (...args) => { calls.push(args); };
    try {
      el.shadowRoot.querySelector('nx-menu')
        .dispatchEvent(new CustomEvent('select', { detail: { id: 'try' } }));
    } finally {
      window.open = origOpen;
    }

    expect(calls).to.deep.equal([['https://example.com/try', '_blank', 'noopener,noreferrer']]);
  });

  it('shows empty message', async () => {
    restoreFetch = installFetch(() => jsonResponse({ data: [] }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const empty = el.shadowRoot.querySelector('.empty');
    expect(empty).to.not.equal(null);
    expect(empty.textContent).to.equal('No extensions available.');
  });

  it('shows only items of the block option categories', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'Core App', Category: 'Core', 'Doc Url': 'https://example.com/a' },
        { Title: 'Ext App', Category: 'Extension', 'Doc Url': 'https://example.com/b' },
        { Title: 'Other App', Category: 'Other', 'Doc Url': 'https://example.com/c' },
      ],
    }));
    div = document.createElement('div');
    div.className = 'marketplace core extension';
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const titles = [...el.shadowRoot.querySelectorAll('.card h3')].map((h) => h.textContent);
    expect(titles).to.deep.equal(['Core App', 'Ext App']);
  });

  it('shows category empty message when nothing matches', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [{ Title: 'Ext App', Category: 'Extension', 'Doc Url': 'https://example.com/b' }],
    }));
    div = document.createElement('div');
    div.className = 'marketplace core';
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const empty = el.shadowRoot.querySelector('.empty');
    expect(empty.textContent).to.equal('No extensions in this category.');
  });

  it('shows error message', async () => {
    restoreFetch = installFetch(() => new Response('', { status: 500 }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const error = el.shadowRoot.querySelector('.error');
    expect(error).to.not.equal(null);
    expect(error.textContent).to.equal('Could not load marketplace.');
    expect(el.shadowRoot.querySelector('.grid') === null).to.equal(true);
  });
});

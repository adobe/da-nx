import { expect } from '@esm-bundle/chai';
import init from '../../../../nx2/blocks/marketplace/marketplace.js';
import { MARKETPLACE_PATH, resetMarketplaceCache } from '../../../../nx2/blocks/marketplace/marketplace-utils.js';

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

describe('nx-marketplace', () => {
  let div;
  let restoreFetch;

  beforeEach(() => {
    resetMarketplaceCache();
  });

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
    expect(el.shadowRoot.querySelector('.item:not(.skeleton)') === null).to.equal(true);
  });

  it('renders toolbar with search but no heading, and one item per valid row', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'DA Permissions', Description: 'Manage permissions', 'Doc Url': 'https://example.com/a' },
        { Title: '', Description: 'No title', 'Doc Url': 'https://example.com/b' },
        { Title: 'Second Item', Description: 'Second', 'Doc Url': 'https://example.com/c' },
        { Title: 'Third Item', Description: 'Third', 'Doc Url': 'https://example.com/d' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    expect(el.shadowRoot.querySelector('.toolbar h1, .toolbar h2, .toolbar h3')).to.equal(null);
    expect(el.shadowRoot.querySelector('nx-search').placeholder).to.equal('Search 3 Capabilities');
    const items = el.shadowRoot.querySelectorAll('.items.list .item');
    expect(items.length).to.equal(3);
    expect(items[0].querySelector('h3').textContent).to.equal('DA Permissions');
  });

  it('renders icon or placeholder', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'Has Icon', Description: 'd', 'Doc Url': 'https://example.com/a', Logo: 'https://example.com/t.png',
        },
        {
          Title: 'No Icon', Description: 'd', 'Doc Url': 'https://example.com/b', Logo: '',
        },
        {
          // eslint-disable-next-line no-script-url
          Title: 'Unsafe Icon', Description: 'd', 'Doc Url': 'https://example.com/c', Logo: 'javascript:x',
        },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const items = el.shadowRoot.querySelectorAll('.item');

    const img0 = items[0].querySelector('img.item-icon');
    expect(img0.src).to.equal('https://example.com/t.png');
    expect(img0.alt).to.equal('');
    expect(img0.loading).to.equal('lazy');
    expect(items[0].querySelector('.placeholder') === null).to.equal(true);

    expect(items[1].querySelector('img') === null).to.equal(true);
    expect(items[1].querySelector('.placeholder') !== null).to.equal(true);

    expect(items[2].querySelector('img') === null).to.equal(true);
    expect(items[2].querySelector('.placeholder') !== null).to.equal(true);
  });

  it('falls back to placeholder when the icon fails to load', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'Has Icon', Description: 'd', 'Doc Url': 'https://example.com/a', Logo: 'https://example.com/t.png',
        },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const card = el.shadowRoot.querySelector('.item');
    card.querySelector('img').dispatchEvent(new Event('error'));
    await el.updateComplete;

    expect(card.querySelector('img') === null).to.equal(true);
    expect(card.querySelector('.placeholder') !== null).to.equal(true);
  });

  it('renders actions as links and no menu in items', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'DA Permissions', Description: 'd', 'Doc Url': 'https://example.com/a', 'Try Url': 'https://example.com/try' },
        { Title: 'Doc Only', Description: 'd', 'Doc Url': 'https://example.com/b' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const [full, docOnly] = el.shadowRoot.querySelectorAll('.item');
    const links = [...full.querySelectorAll('.item-actions a')];
    expect(links.map((a) => [a.textContent.trim(), a.href])).to.deep.equal([
      ['Try out', 'https://example.com/try'],
      ['View details', 'https://example.com/a'],
    ]);
    expect(links.map((a) => a.getAttribute('aria-label'))).to.deep.equal([
      'Try out: DA Permissions (opens in a new tab)',
      'View details: DA Permissions (opens in a new tab)',
    ]);
    links.forEach((a) => {
      expect(a.target).to.equal('_blank');
      expect(a.rel).to.contain('noopener');
    });
    expect(docOnly.querySelectorAll('.item-actions a').length).to.equal(1);
    expect(el.shadowRoot.querySelector('.item nx-menu') === null).to.equal(true);
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

  it('filters by category with the Type rail', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'Core App', Category: 'Core', Date: '2024-01-01', 'Doc Url': 'https://example.com/a' },
        { Title: 'Ext App', Category: 'Extension', Date: '2025-01-01', 'Doc Url': 'https://example.com/b' },
        { Title: 'Other App', Category: 'Other', Date: '2023-01-01', 'Doc Url': 'https://example.com/c' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const titles = () => [...el.shadowRoot.querySelectorAll('.item h3')].map((h) => h.textContent);
    const railItem = (label) => [...el.shadowRoot.querySelectorAll('.rail-item')]
      .find((b) => b.textContent.trim() === label);
    expect(titles()).to.deep.equal(['Core App', 'Ext App', 'Other App']);
    const status = el.shadowRoot.querySelector('.status');
    expect(status.getAttribute('aria-live')).to.equal('polite');
    expect(status.textContent).to.equal('3 capabilities');
    expect(railItem('All Types').getAttribute('aria-current')).to.equal('true');

    railItem('Extension').click();
    await el.updateComplete;
    expect(titles()).to.deep.equal(['Ext App']);
    expect(el.shadowRoot.querySelector('.status').textContent).to.equal('1 capability');
    expect(railItem('Extension').getAttribute('aria-current')).to.equal('true');
    expect(railItem('All Types').getAttribute('aria-current')).to.not.equal('true');

    railItem('All Types').click();
    await el.updateComplete;
    expect(titles()).to.deep.equal(['Core App', 'Ext App', 'Other App']);
  });

  it('searches and shows no-results message', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'Core App', Category: 'Core', Date: '2024-01-01', 'Doc Url': 'https://example.com/a' },
        { Title: 'Ext App', Category: 'Extension', Date: '2025-01-01', 'Doc Url': 'https://example.com/b' },
        { Title: 'Other App', Category: 'Other', Date: '2023-01-01', 'Doc Url': 'https://example.com/c' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const titles = () => [...el.shadowRoot.querySelectorAll('.item h3')].map((h) => h.textContent);
    const search = el.shadowRoot.querySelector('nx-search');
    search.value = 'ext';
    search.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(titles()).to.deep.equal(['Ext App']);
    expect(el.shadowRoot.querySelector('.status').textContent).to.equal('1 capability');

    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(titles()).to.deep.equal([]);
    expect(el.shadowRoot.querySelector('.no-results').textContent.trim())
      .to.equal('No capabilities match your search.');
    expect(el.shadowRoot.querySelector('.empty') === null).to.equal(true);
  });

  it('shows no-results when a Type filter and search combine to nothing', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'Core App', Category: 'Core', 'Doc Url': 'https://example.com/a' },
        { Title: 'Ext App', Category: 'Extension', 'Doc Url': 'https://example.com/b' },
        { Title: 'Other App', Category: 'Other', 'Doc Url': 'https://example.com/c' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    [...el.shadowRoot.querySelectorAll('.rail-item')]
      .find((b) => b.textContent.trim() === 'Core').click();
    await el.updateComplete;
    const search = el.shadowRoot.querySelector('nx-search');
    search.value = 'ext';
    search.dispatchEvent(new Event('input'));
    await el.updateComplete;

    expect(el.shadowRoot.querySelectorAll('.item').length).to.equal(0);
    expect(el.shadowRoot.querySelector('.no-results').textContent.trim())
      .to.equal('No capabilities match your search.');
    expect(el.shadowRoot.querySelector('.empty') === null).to.equal(true);
  });

  it('sorts by newest via the sort menu', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'Core App', Category: 'Core', Date: '2024-01-01', 'Doc Url': 'https://example.com/a' },
        { Title: 'Ext App', Category: 'Extension', Date: '2025-01-01', 'Doc Url': 'https://example.com/b' },
        { Title: 'Other App', Category: 'Other', Date: '2023-01-01', 'Doc Url': 'https://example.com/c' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const titles = () => [...el.shadowRoot.querySelectorAll('.item h3')].map((h) => h.textContent);
    const menu = el.shadowRoot.querySelector('.controls nx-menu');
    expect(menu.items.map(({ id }) => id)).to.deep.equal(['name', 'newest']);
    menu.dispatchEvent(new CustomEvent('select', { detail: { id: 'newest' } }));
    await el.updateComplete;
    expect(titles()).to.deep.equal(['Ext App', 'Core App', 'Other App']);
    expect(menu.querySelector('button').textContent).to.contain('Sort by: Newest');
  });

  it('hides the rail when the sheet has fewer than two categories', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'Ext One', Category: 'Extension', 'Doc Url': 'https://example.com/a' },
        { Title: 'Ext Two', Category: 'extension', 'Doc Url': 'https://example.com/b' },
        { Title: 'No Category', 'Doc Url': 'https://example.com/c' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    expect(el.shadowRoot.querySelector('.rail') === null).to.equal(true);
    expect(el.shadowRoot.querySelectorAll('.item').length).to.equal(3);
  });

  it('toggles between list and grid view', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'A', Description: 'd', 'Doc Url': 'https://example.com/a' },
        { Title: 'B', Description: 'd', 'Doc Url': 'https://example.com/b' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);
    const root = el.shadowRoot;

    expect(root.querySelector('.items.list') !== null).to.equal(true);
    const toggle = root.querySelector('nx-segmented-btn');
    expect(toggle).to.not.equal(null);
    await toggle.updateComplete;
    const labels = [...toggle.shadowRoot.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(labels).to.deep.equal(['List view', 'Grid view']);

    const [listBtn, gridBtn] = toggle.shadowRoot.querySelectorAll('button');
    gridBtn.click();
    await el.updateComplete;
    await toggle.updateComplete;

    expect(gridBtn.getAttribute('aria-pressed')).to.equal('true');
    expect(listBtn.getAttribute('aria-pressed')).to.equal('false');

    expect(root.querySelector('.items.grid') !== null).to.equal(true);
    expect(root.querySelector('.items.list') === null).to.equal(true);
    expect(root.querySelectorAll('.item').length).to.equal(2);
  });

  it('orders actions per view: view details last in list, first in grid', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [{
        Title: 'A', Description: 'd', 'Doc Url': 'https://example.com/a', 'Try Url': 'https://example.com/t',
      }],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);
    const labels = () => [...el.shadowRoot.querySelectorAll('.item-actions a')].map((a) => a.textContent.trim());

    expect(labels()).to.deep.equal(['Try out', 'View details']);
    el._view = 'grid';
    await el.updateComplete;
    expect(labels()).to.deep.equal(['View details', 'Try out']);
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
    expect(el.shadowRoot.querySelector('.items') === null).to.equal(true);
  });
});

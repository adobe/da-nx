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
    expect(el.shadowRoot.querySelector('.grid') === null).to.equal(true);
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

  it('renders the type as a single read-only pill', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'DA Permissions', Description: 'd', 'Doc Url': 'https://example.com/a', Type: 'App & Plugin',
        },
        { Title: 'No Type Item', Description: 'd', 'Doc Url': 'https://example.com/b' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const cards = el.shadowRoot.querySelectorAll('.card');
    const pills = cards[0].querySelector('.media nx-pills');
    expect(pills.label).to.equal('Type');
    expect(pills.items.map(({ label, removable }) => ({ label, removable }))).to.deep.equal([
      { label: 'App & Plugin', removable: false },
    ]);
    expect(cards[1].querySelectorAll('nx-pills').length).to.equal(0);
  });

  it('shows the Adobe logo only for Adobe-owned items', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'Adobe Item', Description: 'd', 'Doc Url': 'https://example.com/a', Owner: 'Adobe',
        },
        {
          Title: 'Partner Item', Description: 'd', 'Doc Url': 'https://example.com/b', Owner: 'Acme',
        },
        { Title: 'No Owner', Description: 'd', 'Doc Url': 'https://example.com/c' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);
    await waitFor(() => el.shadowRoot.querySelector('.adobe-logo svg'));

    const cards = [...el.shadowRoot.querySelectorAll('.card')];
    const logo = cards[0].querySelector('.media .adobe-logo');
    expect(logo.getAttribute('aria-label')).to.equal('Adobe');
    expect(logo.querySelectorAll('svg').length).to.equal(1);
    expect(cards[1].querySelectorAll('.adobe-logo').length).to.equal(0);
    expect(cards[2].querySelectorAll('.adobe-logo').length).to.equal(0);
  });

  it('renders learn more and try out links', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'DA Permissions', Description: 'd', 'Doc Url': 'https://example.com/a', 'Try Url': 'https://example.com/try',
        },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const cta = el.shadowRoot.querySelector('a.cta-primary');
    expect(cta.textContent.trim()).to.equal('Learn more');
    expect(cta.href).to.equal('https://example.com/a');
    expect(cta.target).to.equal('_blank');
    expect(cta.rel).to.equal('noopener noreferrer');
    expect(cta.getAttribute('aria-label')).to.equal('Learn more about DA Permissions');

    const tryCta = el.shadowRoot.querySelector('a.cta-secondary');
    expect(tryCta.textContent.trim()).to.equal('Try out');
    expect(tryCta.href).to.equal('https://example.com/try');
    expect(tryCta.target).to.equal('_blank');
    expect(tryCta.rel).to.equal('noopener noreferrer');
    expect(tryCta.getAttribute('aria-label')).to.equal('Try out DA Permissions');
  });

  it('omits a button when its url is missing', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'Docs Only', Description: 'd', 'Doc Url': 'https://example.com/a' },
        { Title: 'Try Only', Description: 'd', 'Try Url': 'https://example.com/try' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const [docsOnly, tryOnly] = el.shadowRoot.querySelectorAll('.card');
    expect(docsOnly.querySelector('a.cta-primary') !== null).to.equal(true);
    expect(docsOnly.querySelector('a.cta-secondary') === null).to.equal(true);
    expect(tryOnly.querySelector('a.cta-primary') === null).to.equal(true);
    expect(tryOnly.querySelector('a.cta-secondary') !== null).to.equal(true);
  });

  it('renders image or placeholder', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'Has Image', Description: 'd', 'Doc Url': 'https://example.com/a', Image: 'https://example.com/t.png',
        },
        {
          Title: 'No Image', Description: 'd', 'Doc Url': 'https://example.com/b', Image: '',
        },
        {
          // eslint-disable-next-line no-script-url
          Title: 'Unsafe Image', Description: 'd', 'Doc Url': 'https://example.com/c', Image: 'javascript:x',
        },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const cards = el.shadowRoot.querySelectorAll('.card');

    const img0 = cards[0].querySelector('img');
    expect(img0).to.not.equal(null);
    expect(img0.src).to.equal('https://example.com/t.png');
    expect(img0.loading).to.equal('lazy');
    expect(cards[0].querySelector('.placeholder') === null).to.equal(true);

    expect(cards[1].querySelector('img') === null).to.equal(true);
    expect(cards[1].querySelector('.placeholder') !== null).to.equal(true);

    expect(cards[2].querySelector('img') === null).to.equal(true);
    expect(cards[2].querySelector('.placeholder') !== null).to.equal(true);
  });

  it('falls back to placeholder when the image fails to load', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'Has Image', Description: 'd', 'Doc Url': 'https://example.com/a', Image: 'https://example.com/t.png',
        },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const card = el.shadowRoot.querySelector('.card');
    const img = card.querySelector('img');
    expect(img).to.not.equal(null);

    img.dispatchEvent(new Event('error'));
    await el.updateComplete;

    expect(card.querySelector('img') === null).to.equal(true);
    expect(card.querySelector('.placeholder') !== null).to.equal(true);
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

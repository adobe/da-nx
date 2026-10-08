import { expect } from '@esm-bundle/chai';
import init from '../../../../nx2/blocks/marketplace/marketplace.js';

function installFetch(handler) {
  const origFetch = window.fetch;
  window.fetch = async (url, opts) => {
    if (String(url).includes('/apps/marketplace.json')) return handler(url, opts);
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

    expect(el.shadowRoot.querySelector('.loading')).to.not.equal(null);
    expect(el.shadowRoot.querySelector('.grid')).to.equal(null);
  });

  it('renders a card per valid row', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'DA Permissions', Description: 'Manage permissions', Path: 'https://example.com/a' },
        { Title: '', Description: 'No title', Path: 'https://example.com/b' },
        { Title: 'Second Item', Description: 'Second', Path: 'https://example.com/c' },
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

  it('renders type badges', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'DA Permissions', Description: 'd', Path: 'https://example.com/a', Type: 'App & Plugin',
        },
        { Title: 'No Type Item', Description: 'd', Path: 'https://example.com/b' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const cards = el.shadowRoot.querySelectorAll('.card');
    const badges = [...cards[0].querySelectorAll('.badge')].map((b) => b.textContent.trim());
    expect(badges).to.deep.equal(['App', 'Plugin']);
    expect(cards[1].querySelectorAll('.badge').length).to.equal(0);
  });

  it('renders learn more link', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        { Title: 'DA Permissions', Description: 'd', Path: 'https://example.com/a' },
      ],
    }));
    div = document.createElement('div');
    document.body.append(div);
    init(div);

    const el = div.firstElementChild;
    await waitForLoad(el);

    const cta = el.shadowRoot.querySelector('a.cta');
    expect(cta.textContent.trim()).to.equal('Learn more');
    expect(cta.href).to.equal('https://example.com/a');
    expect(cta.target).to.equal('_blank');
    expect(cta.rel).to.equal('noopener noreferrer');
    expect(cta.getAttribute('aria-label')).to.equal('Learn more about DA Permissions');
  });

  it('renders image or placeholder', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'Has Image', Description: 'd', Path: 'https://example.com/a', Image: 'https://example.com/t.png',
        },
        {
          Title: 'No Image', Description: 'd', Path: 'https://example.com/b', Image: '',
        },
        {
          // eslint-disable-next-line no-script-url
          Title: 'Unsafe Image', Description: 'd', Path: 'https://example.com/c', Image: 'javascript:x',
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
    expect(cards[0].querySelector('.placeholder')).to.equal(null);

    expect(cards[1].querySelector('img')).to.equal(null);
    expect(cards[1].querySelector('.placeholder')).to.not.equal(null);

    expect(cards[2].querySelector('img')).to.equal(null);
    expect(cards[2].querySelector('.placeholder')).to.not.equal(null);
  });

  it('falls back to placeholder when the image fails to load', async () => {
    restoreFetch = installFetch(() => jsonResponse({
      data: [
        {
          Title: 'Has Image', Description: 'd', Path: 'https://example.com/a', Image: 'https://example.com/t.png',
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

    expect(card.querySelector('img')).to.equal(null);
    expect(card.querySelector('.placeholder')).to.not.equal(null);
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
    expect(el.shadowRoot.querySelector('.grid')).to.equal(null);
  });
});

import { expect } from '@esm-bundle/chai';
import {
  MARKETPLACE_PATH,
  normalizeItem,
  fetchMarketplace,
  resetMarketplaceCache,
  filterByCategory,
  getCategoryFilters,
  getActions,
  searchItems,
  sortItems,
  getVisibleItems,
  SORT_OPTIONS,
} from '../../../../nx2/blocks/marketplace/marketplace-utils.js';

const origin = 'https://main--da-live--adobe.aem.page';

function installFetch(handler) {
  const origFetch = window.fetch;
  window.fetch = handler;
  return () => { window.fetch = origFetch; };
}

describe('normalizeItem', () => {
  it('maps a full row', () => {
    const row = {
      Title: 'MSM',
      Description: 'Manage msm',
      'Doc Url': 'https://github.com/adobe-rnd/aem-apps/tree/main/tools/apps/msm',
      'Try Url': 'https://da.live/app/x/msm',
      Owner: ' Adobe ',
      Category: ' Core ',
      Logo: 'https://example.com/t.png',
      Date: ' 2026-11-03 ',
    };
    expect(normalizeItem({ row, origin })).to.deep.equal({
      title: 'MSM',
      description: 'Manage msm',
      docHref: 'https://github.com/adobe-rnd/aem-apps/tree/main/tools/apps/msm',
      tryHref: 'https://da.live/app/x/msm',
      category: 'Core',
      iconHref: 'https://example.com/t.png',
      date: '2026-11-03',
    });
  });

  it('trims whitespace', () => {
    const row = { Title: '  MSM  ', 'Doc Url': ' https://da.live/a ' };
    const result = normalizeItem({ row, origin });
    expect(result.title).to.equal('MSM');
    expect(result.docHref).to.equal('https://da.live/a');
  });

  it('returns null without title', () => {
    expect(normalizeItem({ row: { Title: '', 'Doc Url': 'https://da.live/a' }, origin })).to.equal(null);
    expect(normalizeItem({ row: { Title: '   ', 'Doc Url': 'https://da.live/a' }, origin })).to.equal(null);
  });

  it('returns null without doc url and try url', () => {
    expect(normalizeItem({ row: { Title: 'MSM', 'Doc Url': '', 'Try Url': '' }, origin })).to.equal(null);
  });

  it('keeps a row with only a try url', () => {
    const row = { Title: 'MSM', 'Try Url': 'https://da.live/app/x/msm' };
    const result = normalizeItem({ row, origin });
    expect(result.docHref).to.equal(undefined);
    expect(result.tryHref).to.equal('https://da.live/app/x/msm');
  });

  it('drops an unsafe try url', () => {
    // eslint-disable-next-line no-script-url
    const row = { Title: 'MSM', 'Doc Url': 'https://da.live/a', 'Try Url': 'javascript:alert(1)' };
    expect(normalizeItem({ row, origin }).tryHref).to.equal(undefined);
  });

  it('returns null for non-http path', () => {
    // eslint-disable-next-line no-script-url
    const row = { Title: 'MSM', 'Doc Url': 'javascript:alert(1)' };
    expect(normalizeItem({ row, origin })).to.equal(null);
  });

  it('resolves relative path and logo', () => {
    const row = { Title: 'MSM', 'Doc Url': '/tools/x.html', Logo: '/media/t.png' };
    const result = normalizeItem({ row, origin });
    expect(result.docHref).to.equal(`${origin}/tools/x.html`);
    expect(result.iconHref).to.equal(`${origin}/media/t.png`);
  });

  it('drops unsafe or empty logo', () => {
    const base = { Title: 'MSM', 'Doc Url': 'https://da.live/a' };
    expect(normalizeItem({ row: { ...base, Logo: '' }, origin }).iconHref).to.equal(undefined);
    expect(normalizeItem({ row: { ...base, Logo: 'data:image/png;base64,AA' }, origin }).iconHref)
      .to.equal(undefined);
    // eslint-disable-next-line no-script-url
    expect(normalizeItem({ row: { ...base, Logo: 'javascript:x' }, origin }).iconHref).to.equal(undefined);
  });

  it('ignores the Image and Icon columns for the icon', () => {
    const row = {
      Title: 'MSM', 'Doc Url': 'https://da.live/a', Image: 'https://example.com/i.png', Icon: 'https://example.com/c.png',
    };
    expect(normalizeItem({ row, origin }).iconHref).to.equal(undefined);
  });

  it('handles missing description and category', () => {
    const row = { Title: 'MSM', 'Doc Url': 'https://da.live/a' };
    const result = normalizeItem({ row, origin });
    expect(result.description).to.equal('');
    expect(result.category).to.equal('');
    expect(result.date).to.equal('');
  });

  it('ignores the Type column', () => {
    const row = { Title: 'MSM', 'Doc Url': 'https://da.live/a', Type: 'App & Plugin' };
    expect('type' in normalizeItem({ row, origin })).to.equal(false);
  });
});

describe('getActions', () => {
  it('returns try out first and view details last, so view details sits on the right', () => {
    const actions = getActions({ docHref: 'https://example.com/a', tryHref: 'https://example.com/t' });
    expect(actions).to.deep.equal([
      { id: 'try', label: 'Try out', href: 'https://example.com/t' },
      { id: 'details', label: 'View details', href: 'https://example.com/a' },
    ]);
  });

  it('omits actions without a url', () => {
    expect(getActions({ docHref: 'https://example.com/a' }).map(({ id }) => id)).to.deep.equal(['details']);
    expect(getActions({ tryHref: 'https://example.com/t' }).map(({ id }) => id)).to.deep.equal(['try']);
  });
});

describe('filterByCategory', () => {
  const items = [
    { title: 'A', category: 'Core' },
    { title: 'B', category: 'Extension' },
    { title: 'C', category: 'core' },
    { title: 'D', category: '' },
  ];
  const titles = (list) => list.map(({ title }) => title);

  it('returns all items for "all" or no filter', () => {
    expect(titles(filterByCategory({ items, filter: 'all' }))).to.deep.equal(['A', 'B', 'C', 'D']);
    expect(titles(filterByCategory({ items }))).to.deep.equal(['A', 'B', 'C', 'D']);
  });

  it('returns core items, case-insensitive', () => {
    expect(titles(filterByCategory({ items, filter: 'core' }))).to.deep.equal(['A', 'C']);
  });

  it('returns extension items', () => {
    expect(titles(filterByCategory({ items, filter: 'extension' }))).to.deep.equal(['B']);
  });
});

describe('getCategoryFilters', () => {
  it('starts with All, then each sheet category in first-seen order', () => {
    const items = [
      { category: 'Extension' }, { category: 'Core' }, { category: 'extension' }, { category: 'Beta' },
    ];
    expect(getCategoryFilters(items)).to.deep.equal([
      { value: 'all', label: 'All Types' },
      { value: 'extension', label: 'Extension' },
      { value: 'core', label: 'Core' },
      { value: 'beta', label: 'Beta' },
    ]);
  });

  it('skips empty categories and one named "all"', () => {
    const items = [{ category: '' }, { category: 'All' }, {}, { category: 'Core' }];
    expect(getCategoryFilters(items).map(({ value }) => value)).to.deep.equal(['all', 'core']);
  });

  it('returns only All Types without items', () => {
    expect(getCategoryFilters([])).to.deep.equal([{ value: 'all', label: 'All Types' }]);
    expect(getCategoryFilters()).to.deep.equal([{ value: 'all', label: 'All Types' }]);
  });
});

describe('SORT_OPTIONS', () => {
  it('lists name and newest', () => {
    expect(SORT_OPTIONS).to.deep.equal([{ id: 'name', label: 'Name' }, { id: 'newest', label: 'Newest' }]);
  });
});

describe('searchItems', () => {
  const items = [
    { title: 'Anchor Links', description: 'Jump' },
    { title: 'Tabs', description: 'Tabbed sections' },
  ];

  it('matches title, trimmed and case-insensitive', () => {
    expect(searchItems({ items, query: '  ANCHOR ' })).to.deep.equal([items[0]]);
  });

  it('matches description', () => {
    expect(searchItems({ items, query: 'sections' })).to.deep.equal([items[1]]);
  });

  it('returns the same array for an empty query', () => {
    expect(searchItems({ items, query: '' })).to.equal(items);
    expect(searchItems({ items, query: '   ' })).to.equal(items);
  });

  it('treats a null query as empty', () => {
    expect(searchItems({ items, query: null })).to.equal(items);
  });

  it('returns [] without a match', () => {
    expect(searchItems({ items, query: 'zzz' })).to.deep.equal([]);
  });
});

describe('sortItems', () => {
  const titles = (list) => list.map(({ title }) => title);

  it('sorts by name case-insensitively by default', () => {
    const items = [{ title: 'beta' }, { title: 'Alpha' }, { title: 'alpha2' }, { title: 'Beta2' }];
    const expected = ['Alpha', 'alpha2', 'beta', 'Beta2'];
    expect(titles(sortItems({ items }))).to.deep.equal(expected);
    expect(titles(sortItems({ items, sort: 'name' }))).to.deep.equal(expected);
  });

  it('sorts newest first, undated last by title, without mutating', () => {
    const items = [
      { title: 'D', date: '2026-10-01' },
      { title: 'C', date: '' },
      { title: 'B', date: '2026-11-19' },
      { title: 'A', date: 'nope' },
    ];
    const copy = [...items];
    expect(titles(sortItems({ items, sort: 'newest' }))).to.deep.equal(['B', 'D', 'A', 'C']);
    expect(items).to.deep.equal(copy);
  });
});

describe('getVisibleItems', () => {
  it('filters, searches and sorts together', () => {
    const items = [
      { title: 'Old ext', description: 'tool', category: 'Extension', date: '2026-01-01' },
      { title: 'New ext', description: 'tool', category: 'Extension', date: '2026-11-01' },
      { title: 'Core tool', description: 'tool', category: 'Core', date: '2026-12-01' },
      { title: 'Other', description: 'x', category: 'Extension', date: '2026-12-01' },
    ];
    const result = getVisibleItems({
      items, filter: 'extension', query: 'tool', sort: 'newest',
    });
    expect(result.map(({ title }) => title)).to.deep.equal(['New ext', 'Old ext']);
  });
});

describe('fetchMarketplace', () => {
  let restoreFetch;

  beforeEach(() => {
    resetMarketplaceCache();
  });

  afterEach(() => {
    restoreFetch?.();
  });

  it('shares one request between calls for the same origin', async () => {
    let calls = 0;
    restoreFetch = installFetch(async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    const [a, b] = await Promise.all([fetchMarketplace({ origin }), fetchMarketplace({ origin })]);

    expect(calls).to.equal(1);
    expect(a).to.equal(b);
  });

  it('does not cache failed results so a later call retries', async () => {
    let calls = 0;
    restoreFetch = installFetch(async () => {
      calls += 1;
      if (calls === 1) return new Response('', { status: 500 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    const first = await fetchMarketplace({ origin });
    const second = await fetchMarketplace({ origin });

    expect(first.error).to.equal('Could not load marketplace.');
    expect(second).to.deep.equal({ items: [] });
    expect(calls).to.equal(2);
  });

  it('requests the marketplace path on the origin', async () => {
    let capturedArg;
    restoreFetch = installFetch(async (url) => {
      capturedArg = url;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    await fetchMarketplace({ origin });

    expect(String(capturedArg)).to.equal(`${origin}${MARKETPLACE_PATH}`);
  });

  it('returns normalized items, dropping invalid rows', async () => {
    const validRow = {
      Title: 'MSM',
      Description: 'Manage msm',
      'Doc Url': 'https://da.live/app/x/msm',
      Logo: 'https://example.com/t.png',
    };
    restoreFetch = installFetch(async () => new Response(
      JSON.stringify({ data: [validRow, { Title: '', 'Doc Url': 'x' }] }),
      { status: 200 },
    ));

    const result = await fetchMarketplace({ origin });

    expect(result.items.length).to.equal(1);
    expect(result.items[0].title).to.equal(validRow.Title);
  });

  it('returns empty items when data missing', async () => {
    restoreFetch = installFetch(async () => new Response(JSON.stringify({}), { status: 200 }));

    const result = await fetchMarketplace({ origin });

    expect(result).to.deep.equal({ items: [] });
  });

  it('normalizes items from a multi-sheet doc, using the first sheet', async () => {
    const validRow = { Title: 'MSM', Description: 'Manage msm', 'Doc Url': 'https://da.live/app/x/msm' };
    restoreFetch = installFetch(async () => new Response(JSON.stringify({
      ':type': 'multi-sheet',
      ':names': ['apps', 'other'],
      apps: { data: [validRow] },
      other: { data: [{ Title: 'Ignored', 'Doc Url': 'https://da.live/other' }] },
    }), { status: 200 }));

    const result = await fetchMarketplace({ origin });

    expect(result.items.length).to.equal(1);
    expect(result.items[0].title).to.equal('MSM');
  });

  it('returns error with status on non-OK', async () => {
    restoreFetch = installFetch(async () => new Response('', { status: 404 }));

    const result = await fetchMarketplace({ origin });

    expect(result).to.deep.equal({ error: 'Could not load marketplace.', status: 404 });
  });

  it('returns error when fetch throws', async () => {
    restoreFetch = installFetch(async () => { throw new Error('network down'); });

    const result = await fetchMarketplace({ origin });

    expect(result.error).to.equal('Could not load marketplace.');
    expect(result.items).to.equal(undefined);
  });

  it('returns error when body is not JSON', async () => {
    restoreFetch = installFetch(async () => new Response('<html>', { status: 200 }));

    const result = await fetchMarketplace({ origin });

    expect(result.error).to.equal('Could not load marketplace.');
  });
});

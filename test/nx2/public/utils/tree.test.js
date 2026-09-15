import { expect } from '@esm-bundle/chai';
import { HLX_ADMIN, AEM_API, DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { crawl } from '../../../../nx2/public/utils/tree.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps
// does not rewrite this to ...?wds-import-map=0. The same mock URL is reached at
// runtime via the inline importmap when api.js's dynamic IIFE imports ims.js, so
// both this test and api.js receive the *same* mock module instance.
const imsPath = '../../../../nx2/utils/ims.js';
const { resetMockIms } = await import(imsPath);

let counter = 0;
const uniq = (label) => {
  counter += 1;
  return `${label}-${counter}-${Math.floor(Math.random() * 1e6)}`;
};

// Unique org/site per call so isHlx6's in-memory cache never collides between
// tests. hlx6-detection is driven via the ping response header (see installFetch)
// rather than seeded localStorage, which is shared across concurrently-running
// test files and therefore raced.
const makeOrgSite = () => ({ org: uniq('org'), site: uniq('site') });

let origFetch;

// Route fetches by first matching URL substring; each route value is the JSON
// list body to return. Most specific keys must be listed first. `hlx6` controls
// whether the upgrade-status ping advertises Helix 6.
const installFetch = (routes, { hlx6 = false } = {}) => {
  origFetch = window.fetch;
  window.fetch = async (url) => {
    const u = url.toString();
    if (u.includes(`${HLX_ADMIN}/ping/`)) {
      const headers = hlx6 ? { 'x-api-upgrade-available': 'true' } : {};
      return new Response('', { status: 200, headers });
    }
    const key = Object.keys(routes).find((k) => u.includes(k));
    return new Response(JSON.stringify(key ? routes[key] : []), { status: 200 });
  };
};

const restoreFetch = () => {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
};

describe('nx2 crawl (backend-aware)', () => {
  beforeEach(() => {
    resetMockIms();
  });

  afterEach(() => {
    restoreFetch();
  });

  it('crawls a Helix 6 site via source.list (regression for delete count)', async () => {
    const { org: o, site: s } = makeOrgSite();
    installFetch({
      [`${AEM_API}/${o}/sites/${s}/source/folder/sub/`]: [
        { name: 'deep.json', 'content-type': 'application/json' },
      ],
      [`${AEM_API}/${o}/sites/${s}/source/folder/`]: [
        { name: 'doc.html', 'content-type': 'text/html' },
        { name: 'sub/', 'content-type': 'application/folder' },
      ],
    }, { hlx6: true });

    const { results } = crawl({
      path: `/${o}/${s}/folder`,
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(files).to.have.length(2);
    expect(files.some((f) => f.name === 'doc' && f.ext === 'html')).to.equal(true);
    expect(files.some((f) => f.name === 'deep' && f.ext === 'json')).to.equal(true);
  });

  it('crawls the legacy DA backend via source.list fallback', async () => {
    const { org: o, site: s } = makeOrgSite();
    installFetch({
      [`${DA_ADMIN}/list/${o}/${s}/folder`]: [
        { path: `/${o}/${s}/folder/page.html`, name: 'page', ext: 'html', lastModified: 1 },
        { path: `/${o}/${s}/folder/data.json`, name: 'data', ext: 'json', lastModified: 2 },
      ],
    });

    const { results } = crawl({
      path: `/${o}/${s}/folder`,
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(files).to.have.length(2);
    expect(files.map((f) => f.name).sort()).to.deep.equal(['data', 'page']);
  });

  it('follows the continuation token across pages', async () => {
    const { org: o, site: s } = makeOrgSite();
    let page = 0;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      if (u.includes(`${HLX_ADMIN}/ping/`)) return new Response('', { status: 200 });
      const hasToken = opts.headers?.['da-continuation-token'];
      if (!hasToken) {
        page += 1;
        return new Response(
          JSON.stringify([{ path: `/${o}/${s}/big/a.html`, name: 'a', ext: 'html' }]),
          { status: 200, headers: { 'da-continuation-token': 'next' } },
        );
      }
      return new Response(
        JSON.stringify([{ path: `/${o}/${s}/big/b.html`, name: 'b', ext: 'html' }]),
        { status: 200 },
      );
    };

    const { results } = crawl({
      path: `/${o}/${s}/big`,
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(page).to.equal(1);
    expect(files.map((f) => f.name).sort()).to.deep.equal(['a', 'b']);
  });

  it('stops a folder listing on a non-ok response', async () => {
    const { org: o, site: s } = makeOrgSite();
    origFetch = window.fetch;
    window.fetch = async (url) => {
      const u = url.toString();
      if (u.includes(`${HLX_ADMIN}/ping/`)) return new Response('', { status: 200 });
      return new Response('', { status: 403 });
    };

    const { results } = crawl({
      path: `/${o}/${s}/folder`,
      callback: null,
      concurrent: 10,
      throttle: 10,
    });

    const files = await results;
    expect(files).to.deep.equal([]);
  });
});

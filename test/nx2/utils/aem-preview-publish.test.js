import { expect } from '@esm-bundle/chai';
import {
  AEM_API, DA_ADMIN, HLX_ADMIN, object2sheet,
} from '../../../nx2/utils/utils.js';
import {
  calls as sharedCalls,
  installFetch as installFetchOnce,
  restoreFetch as restoreFetchOnce,
} from '../../../nx2/test/mocks/fetch.js';
import {
  buildAemPathFromHashState,
  fetchWysiwygBranch,
  formatAemPreviewPublishError,
  getAemBranch,
  getAemBranchHref,
  requestAemRole,
  runAemPreviewOrPublish,
} from '../../../nx2/utils/aem-preview-publish.js';

const STORAGE_KEY = 'hlx6-upgrade';
const flagHlx6 = (org, site) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}),
    [`/${org}/${site}`]: true,
  }));
};

let origFetch;
let calls = [];

// requestAemRole -> api.js's source.get/source.save, which probe isHlx6
// (HLX_ADMIN/ping/...) before hitting the source endpoint. That ping is
// served here without consuming a slot in `responses`, which is reserved
// for the GET/POST calls under test.
const installFetch = (responses = []) => {
  calls = [];
  origFetch = window.fetch;
  let idx = 0;
  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
    calls.push({ url: u, method: opts.method || 'GET', body: opts.body });
    if (u.includes(`${HLX_ADMIN}/ping/`)) return new Response('', { status: 200 });
    const resp = responses[idx] ?? responses[responses.length - 1];
    idx += 1;
    return resp;
  };
};

const restoreFetch = () => {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
};

const mockIms = (profile) => {
  window.adobeIMS = { getProfile: async () => profile };
};

const clearIms = () => { delete window.adobeIMS; };

// isHlx6 memoizes per org/site at the api.js module level for the lifetime
// of the test run, so each test uses a fresh org/site pair (same convention
// as api.test.js) to avoid one test's cached upgrade-status bleeding into
// another's assertions.
let counter = 0;
const uniq = (label) => {
  counter += 1;
  return `${label}-${counter}`;
};

const PROFILE = { userId: 'uid-1', email: 'test@adobe.com', displayName: 'Test User' };
const permUrl = (org, site) => `${DA_ADMIN}/source/${org}/${site}/.da/aem-permission-requests.json`;
const permCalls = (org, site) => calls.filter((c) => c.url === permUrl(org, site));
const EMPTY_TPL = '{"users":{"total":1,"limit":1,"offset":0,"data":[]},"data":{"total":1,"limit":1,"offset":0,"data":[{}]},":names":["users","data"],":version":3,":type":"multi-sheet"}';

describe('aem-preview-publish.js', () => {
  afterEach(() => {
    restoreFetch();
    clearIms();
  });

  describe('buildAemPathFromHashState', () => {
    it('returns null when any segment is missing', () => {
      expect(buildAemPathFromHashState(null)).to.be.null;
      expect(buildAemPathFromHashState({ org: 'o', site: 's' })).to.be.null;
    });

    it('builds lowercased path', () => {
      expect(buildAemPathFromHashState({ org: 'Org', site: 'Site', path: '/Doc' })).to.equal('/org/site/doc');
    });
  });

  describe('formatAemPreviewPublishError', () => {
    it('returns unknown error for missing input', () => {
      expect(formatAemPreviewPublishError(null)).to.equal('Unknown error');
    });

    it('concatenates details when present', () => {
      expect(formatAemPreviewPublishError({ message: 'Err', details: 'info' })).to.equal('Err: info');
    });
  });

  describe('requestAemRole', () => {
    it('returns failure message when adobeIMS is unavailable', async () => {
      const result = await requestAemRole('myorg', 'mysite', 'preview');
      expect(result.message[0]).to.equal('Could not get user profile.');
      expect(result.message[1]).to.equal('Please sign in and try again.');
    });

    it('uses template JSON when permission file does not exist (GET 404) and returns success on POST 200', async () => {
      const org = uniq('org');
      const site = uniq('site');
      mockIms(PROFILE);
      installFetch([
        new Response('Not found', { status: 404 }),
        new Response('{}', { status: 200 }),
      ]);

      const result = await requestAemRole(org, site, 'preview');

      expect(result.message[0]).to.equal('Successfully requested role!');
      expect(result.message[1]).to.equal('An administrator will need to approve.');
      const [getCall, postCall] = permCalls(org, site);
      expect(getCall.method).to.equal('GET');
      expect(postCall.method).to.equal('POST');
    });

    it('reads existing JSON and upserts current user when GET 200', async () => {
      const org = uniq('org');
      const site = uniq('site');
      mockIms(PROFILE);
      const existing = JSON.parse(EMPTY_TPL);
      existing.users.data.push({ Id: 'other-uid', Email: 'other@test.com', Action: 'preview' });

      installFetch([
        new Response(JSON.stringify(existing), { status: 200 }),
        new Response('{}', { status: 200 }),
      ]);

      const result = await requestAemRole(org, site, 'preview');
      expect(result.message[0]).to.equal('Successfully requested role!');

      // The posted body is FormData — verify the blob content
      const [, postCall] = permCalls(org, site);
      const formData = postCall.body;
      expect(formData).to.be.instanceOf(FormData);
      const blob = formData.get('data');
      const text = await blob.text();
      const saved = JSON.parse(text);

      // Verify new user entry for current userId
      expect(saved.users.data.filter((u) => u.Id === PROFILE.userId)).to.have.length(1);
      expect(saved.users.data.filter((u) => u.Id === PROFILE.userId)[0].Action).to.equal('preview');

      // Verify existing other-uid entry is still present
      expect(saved.users.data.filter((u) => u.Id === 'other-uid')).to.have.length(1);

      // Verify total entries
      expect(saved.users.data).to.have.length(2);
    });

    it('updates existing entry in place (same userId)', async () => {
      const org = uniq('org');
      const site = uniq('site');
      mockIms(PROFILE);
      const existing = JSON.parse(EMPTY_TPL);
      existing.users.data.push({ Id: PROFILE.userId, Email: PROFILE.email, Action: 'old-action' });

      installFetch([
        new Response(JSON.stringify(existing), { status: 200 }),
        new Response('{}', { status: 200 }),
      ]);

      await requestAemRole(org, site, 'preview');

      // Only one entry expected — verify by checking FormData blob content
      const [, postCall] = permCalls(org, site);
      const formData = postCall.body;
      const blob = formData.get('data');
      const text = await blob.text();
      const saved = JSON.parse(text);
      expect(saved.users.data.filter((u) => u.Id === PROFILE.userId)).to.have.length(1);
      expect(saved.users.data[0].Action).to.equal('preview');
    });

    it('returns failure message when POST fails', async () => {
      const org = uniq('org');
      const site = uniq('site');
      mockIms(PROFILE);
      installFetch([
        new Response('Not found', { status: 404 }),
        new Response('Server error', { status: 500 }),
      ]);

      const result = await requestAemRole(org, site, 'preview');
      expect(result.message[0]).to.equal('Could not request permissions.');
      expect(result.message[1]).to.equal('Please notify your administrator.');
    });
  });

  describe('runAemPreviewOrPublish', () => {
    afterEach(() => restoreFetchOnce());

    it('rejects an invalid action without making any request', async () => {
      const result = await runAemPreviewOrPublish({ aemPath: '/org/site/page', action: 'bogus' });
      expect(result.ok).to.equal(false);
      expect(result.error.message).to.equal('Invalid action');
    });

    it('preview: legacy hits HLX_ADMIN and resolves the URL from json.preview.url', async () => {
      const org = uniq('org');
      const site = uniq('site');
      installFetchOnce({ body: JSON.stringify({ preview: { url: 'https://legacy-preview.example/page' } }) });

      const result = await runAemPreviewOrPublish({ aemPath: `/${org}/${site}/page`, action: 'preview' });

      expect(result.ok).to.equal(true);
      expect(result.url).to.equal('https://legacy-preview.example/page');
      expect(sharedCalls.some((c) => c.url === `${HLX_ADMIN}/preview/${org}/${site}/main/page`)).to.equal(true);
    });

    it('preview: hlx6 hits AEM_API instead of HLX_ADMIN', async () => {
      const org = uniq('org');
      const site = uniq('site');
      flagHlx6(org, site);
      installFetchOnce({ body: JSON.stringify({ preview: { url: 'https://hlx6-preview.example/page' } }) });

      const result = await runAemPreviewOrPublish({ aemPath: `/${org}/${site}/page`, action: 'preview' });

      expect(result.ok).to.equal(true);
      expect(result.url).to.equal('https://hlx6-preview.example/page');
      expect(sharedCalls.some((c) => c.url === `${AEM_API}/${org}/sites/${site}/preview/page`)).to.equal(true);
      expect(sharedCalls.some((c) => c.url.includes(`${HLX_ADMIN}/preview/`))).to.equal(false);
    });

    it('publish: previews then publishes, resolving the URL from json.live.url', async () => {
      const org = uniq('org');
      const site = uniq('site');
      installFetchOnce({
        body: JSON.stringify({
          preview: { url: 'https://legacy-preview.example/page' },
          live: { url: 'https://legacy-live.example/page' },
        }),
      });

      const result = await runAemPreviewOrPublish({ aemPath: `/${org}/${site}/page`, action: 'publish' });

      expect(result.ok).to.equal(true);
      expect(result.url).to.equal('https://legacy-live.example/page');
      expect(sharedCalls.some((c) => c.url === `${HLX_ADMIN}/preview/${org}/${site}/main/page`)).to.equal(true);
      expect(sharedCalls.some((c) => c.url === `${HLX_ADMIN}/live/${org}/${site}/main/page`)).to.equal(true);
    });

    it('returns an authorization error on 401 without a details field', async () => {
      const org = uniq('org');
      const site = uniq('site');
      installFetchOnce({ status: 401 });

      const result = await runAemPreviewOrPublish({ aemPath: `/${org}/${site}/page`, action: 'preview' });

      expect(result.ok).to.equal(false);
      expect(result.error.message).to.equal('Not authorized to preview.');
      expect(result.error.details).to.be.undefined;
    });

    it('strips the admin/preview boilerplate from an x-error header on failure', async () => {
      const org = uniq('org');
      const site = uniq('site');
      installFetchOnce({
        status: 500,
        headers: { 'x-error': "[admin] Unable to preview '/org/site/page': some detail" },
      });

      const result = await runAemPreviewOrPublish({ aemPath: `/${org}/${site}/page`, action: 'preview' });

      expect(result.ok).to.equal(false);
      expect(result.error.message).to.equal('Error during preview');
      expect(result.error.details).to.equal('some detail');
    });

    it('rewrites the live/publish error action and message when publish fails', async () => {
      const org = uniq('org');
      const site = uniq('site');
      installFetch([
        new Response(JSON.stringify({ preview: { url: 'https://legacy-preview.example/page' } }), { status: 200 }),
        new Response('forbidden', { status: 403 }),
      ]);

      const result = await runAemPreviewOrPublish({ aemPath: `/${org}/${site}/page`, action: 'publish' });

      expect(result.ok).to.equal(false);
      expect(result.error.action).to.equal('publish');
      expect(result.error.message).to.equal('Not authorized to publish.');
    });

    it('returns ok:false when the response has no preview URL and no sidekick fallback resolves', async () => {
      const org = uniq('org');
      const site = uniq('site');
      installFetchOnce({ body: JSON.stringify({}) });

      const result = await runAemPreviewOrPublish({ aemPath: `/${org}/${site}/page`, action: 'preview' });

      expect(result.ok).to.equal(false);
      expect(result.error.message).to.equal('Preview URL missing from response.');
    });

    it('preview: targets the branch host when a branch is given', async () => {
      const org = uniq('org');
      const site = uniq('site');
      installFetchOnce({ body: JSON.stringify({ webPath: '/page', preview: { url: `https://main--${site}--${org}.aem.page/page` } }) });

      const result = await runAemPreviewOrPublish({ aemPath: `/${org}/${site}/page`, action: 'preview', branch: 'feat-x' });

      expect(result.url).to.equal(`https://feat-x--${site}--${org}.aem.page/page`);
      expect(sharedCalls.some((c) => c.url.includes('/sidekick/'))).to.equal(false);
    });

    it('publish: targets the branch live host when a branch is given', async () => {
      const org = uniq('org');
      const site = uniq('site');
      installFetchOnce({
        body: JSON.stringify({
          webPath: '/page',
          preview: { url: 'https://legacy-preview.example/page' },
          live: { url: 'https://legacy-live.example/page' },
        }),
      });

      const result = await runAemPreviewOrPublish({ aemPath: `/${org}/${site}/page`, action: 'publish', branch: 'feat-x' });

      expect(result.url).to.equal(`https://feat-x--${site}--${org}.aem.live/page`);
    });
  });

  describe('getAemBranch', () => {
    it('returns null for empty, main, and local', () => {
      expect(getAemBranch(null)).to.be.null;
      expect(getAemBranch('')).to.be.null;
      expect(getAemBranch('main')).to.be.null;
      expect(getAemBranch('Local')).to.be.null;
    });

    it('normalizes a branch name to its hostname form', () => {
      expect(getAemBranch('Feat/My_Branch')).to.equal('feat-my-branch');
    });
  });

  describe('fetchWysiwygBranch', () => {
    let origWarn;
    let warnings;
    beforeEach(() => {
      origWarn = console.warn;
      warnings = [];
      console.warn = (...args) => { warnings.push(args); };
    });
    afterEach(() => { console.warn = origWarn; });

    const sheet = (data) => new Response(JSON.stringify({ data }), { status: 200 });
    const routeFetch = (routes) => {
      origFetch = window.fetch;
      window.fetch = async (url) => {
        const u = url.toString();
        if (u.includes(`${HLX_ADMIN}/ping/`)) return new Response('', { status: 200 });
        const hit = Object.keys(routes).find((k) => u.endsWith(k));
        return hit ? routes[hit]() : new Response('', { status: 404 });
      };
    };
    const withRef = async (ref, fn) => {
      const orig = window.location.href;
      window.history.replaceState(null, '', `${window.location.pathname}?ref=${ref}`);
      try {
        await fn();
      } finally {
        window.history.replaceState(null, '', orig);
      }
    };

    it('returns main when org or site is missing', async () => {
      expect(await fetchWysiwygBranch({ site: 's' })).to.equal('main');
      expect(await fetchWysiwygBranch({ org: 'o' })).to.equal('main');
    });

    it('returns the ref param when present', async () => {
      await withRef('Feat/X', async () => {
        expect(await fetchWysiwygBranch({ org: 'o', site: 's' })).to.equal('Feat/X');
      });
    });

    it('picks the longest matching prefix, site config winning ties, trimming the branch', async () => {
      const org = uniq('org');
      const site = uniq('site');
      routeFetch({
        [`/config/${org}/`]: () => sheet([{ key: 'ew.wysiwygBranch', value: `/${org}/${site}=org-branch` }]),
        [`/config/${org}/${site}/`]: () => sheet([
          { key: 'ew.wysiwygBranch', value: `/${org}/${site}=site-branch` },
          { key: 'ew.wysiwygBranch', value: `/${org}/${site}/docs=  develop ` },
          { key: 'ew.wysiwygBranch', value: 'malformed' },
        ]),
      });
      expect(await fetchWysiwygBranch({ org, site, path: `${org}/${site}/blog/a` })).to.equal('site-branch');
      expect(await fetchWysiwygBranch({ org, site, path: `${org}/${site}/docs/a` })).to.equal('develop');
      expect(await fetchWysiwygBranch({ org, site, path: `${org}/${site}/docs` })).to.equal('develop');
      expect(await fetchWysiwygBranch({ org, site, path: `${org}/${site}/docs-archive/a` })).to.equal('site-branch');
      expect(await fetchWysiwygBranch({ org, site, path: `${org}/${site}-archive/a` })).to.equal('main');
    });

    it('reads a configured branch from object2sheet-shaped legacy config', async () => {
      const org = uniq('org');
      const site = uniq('site');
      const rows = [{ key: 'ew.wysiwygBranch', value: `/${org}/${site}=develop` }];
      routeFetch({
        [`/config/${org}/`]: () => sheet([]),
        [`/config/${org}/${site}/`]: () => new Response(JSON.stringify(object2sheet({
          config: rows, flags: [],
        }))),
      });
      expect(await fetchWysiwygBranch({ org, site, path: `${org}/${site}/a` })).to.equal('develop');
    });

    it('reads a configured branch through the hlx6 object2sheet conversion path', async () => {
      const org = uniq('org');
      const site = uniq('site');
      flagHlx6(org, site);
      routeFetch({
        [`/config/${org}/`]: () => sheet([]),
        [`/${org}/sites/${site}/config/editor/da.json`]: () => new Response(JSON.stringify({
          config: [{ key: 'ew.wysiwygBranch', value: `/${org}/${site}=develop` }],
          flags: [],
        })),
      });
      expect(await fetchWysiwygBranch({ org, site, path: `${org}/${site}/a` })).to.equal('develop');
    });

    it('matches prefixes with trailing slashes and a root default', async () => {
      const org = uniq('org');
      const site = uniq('site');
      routeFetch({
        [`/config/${org}/`]: () => sheet([]),
        [`/config/${org}/${site}/`]: () => sheet([
          { key: 'ew.wysiwygBranch', value: '/=root-branch' },
          { key: 'ew.wysiwygBranch', value: `/${org}/${site}/docs/=develop` },
        ]),
      });
      expect(await fetchWysiwygBranch({ org, site, path: `${org}/${site}/docs` })).to.equal('develop');
      expect(await fetchWysiwygBranch({ org, site, path: `${org}/${site}/docs/a` })).to.equal('develop');
      expect(await fetchWysiwygBranch({ org, site, path: `${org}/${site}/docs-archive/a` })).to.equal('root-branch');
    });

    [404, 403].forEach((status) => {
      it(`uses org config and logs the status when site config returns ${status}`, async () => {
        const org = uniq('org');
        const site = uniq('site');
        routeFetch({
          [`/config/${org}/`]: () => sheet([
            { key: 'ew.wysiwygBranch', value: `/${org}/${site}=org-branch` },
          ]),
          [`/config/${org}/${site}/`]: () => new Response('', { status }),
        });
        expect(await fetchWysiwygBranch({ org, site })).to.equal('org-branch');
        expect(warnings).to.deep.equal([[`Error loading /${org}/${site}`, status]]);
      });
    });

    it('uses site config when org config is unavailable', async () => {
      const org = uniq('org');
      const site = uniq('site');
      routeFetch({
        [`/config/${org}/${site}/`]: () => sheet([
          { key: 'ew.wysiwygBranch', value: `/${org}/${site}=site-branch` },
        ]),
      });
      expect(await fetchWysiwygBranch({ org, site })).to.equal('site-branch');
      expect(warnings).to.deep.equal([[`Error loading /${org}`, 404]]);
    });

    it('falls back to main and logs explicit errors when neither config is available', async () => {
      const org = uniq('org');
      const site = uniq('site');
      routeFetch({});
      expect(await fetchWysiwygBranch({ org, site })).to.equal('main');
      expect(warnings).to.deep.equal([
        [`Error loading /${org}`, 404],
        [`Error loading /${org}/${site}`, 404],
      ]);
    });

    it('propagates invalid config JSON and retries the rejected config fetch', async () => {
      const org = uniq('org');
      const site = uniq('site');
      let invalid = true;
      routeFetch({
        [`/config/${org}/`]: () => sheet([]),
        [`/config/${org}/${site}/`]: () => (invalid
          ? new Response('{invalid json')
          : sheet([{ key: 'ew.wysiwygBranch', value: `/${org}/${site}=develop` }])),
      });
      let error;
      try {
        await fetchWysiwygBranch({ org, site });
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(SyntaxError);
      invalid = false;
      expect(await fetchWysiwygBranch({ org, site })).to.equal('develop');
    });

    it('does not hide TypeErrors while processing malformed branch rows', async () => {
      const org = uniq('org');
      const site = uniq('site');
      routeFetch({
        [`/config/${org}/`]: () => sheet([]),
        [`/config/${org}/${site}/`]: () => sheet([{ key: 'ew.wysiwygBranch', value: null }]),
      });
      let error;
      try {
        await fetchWysiwygBranch({ org, site });
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(TypeError);
    });

    it('returns main when no config row matches', async () => {
      const org = uniq('org');
      const site = uniq('site');
      routeFetch({ [`/config/${org}/`]: () => sheet([{ key: 'ew.wysiwygBranch', value: '/other/site=feature' }]) });
      expect(await fetchWysiwygBranch({ org, site, path: `${org}/${site}/a` })).to.equal('main');
    });
  });

  describe('getAemBranchHref', () => {
    it('builds preview and live branch URLs', () => {
      const args = { aemPath: '/org/site/a/b', branch: 'dev', webPath: '/a/b' };
      expect(getAemBranchHref({ ...args, tier: 'preview' })).to.equal('https://dev--site--org.aem.page/a/b');
      expect(getAemBranchHref({ ...args, tier: 'live' })).to.equal('https://dev--site--org.aem.live/a/b');
    });

    it('returns null without a branch or webPath', () => {
      expect(getAemBranchHref({ aemPath: '/org/site/a', branch: null, tier: 'preview', webPath: '/a' })).to.be.null;
      expect(getAemBranchHref({ aemPath: '/org/site/a', branch: 'dev', tier: 'preview' })).to.be.null;
    });
  });
});

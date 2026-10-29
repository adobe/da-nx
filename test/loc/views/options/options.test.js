import { expect } from '@esm-bundle/chai';
import '../../../../nx/blocks/loc/views/options/options.js';
import {
  filterLangsBySource,
  formatLangs,
  finalizeOptions,
  getProjectSource,
} from '../../../../nx/blocks/loc/views/options/utils/utils.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps
// does not rewrite this to ...?wds-import-map=0. See test/nx2/utils/api.test.js.
const imsPath = '../../../../nx2/utils/ims.js';
const { resetMockIms } = await import(imsPath);

const org = 'acme';
const site = 'site1';

let origFetch;

function installFetch(handler) {
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => handler(url.toString(), opts);
}

function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

function globalLinkHandler(projects) {
  return (u) => {
    if (u.includes('/integrations/globallink/login')) {
      return new Response(JSON.stringify({ access_token: 'gl-token' }), { status: 200 });
    }
    if (u.includes('/rest/v0/projects')) {
      return new Response(JSON.stringify(projects), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
}

function createOptionsEl() {
  const el = document.createElement('nx-loc-options');
  el.project = { org, site, urls: [] };
  el._siteOptions = { 'translation.service.all.env': 'prod' };
  el._siteLangs = [{ code: 'fr', activeAction: { value: 'translate' } }];
  el._siteConfig = {
    service: {
      name: 'GlobalLink',
      envs: { prod: { endpoint: 'https://real-globallink.example.com' } },
    },
  };
  return el;
}

describe('NxLocOptions - loadConnectorServiceOptions', () => {
  beforeEach(() => {
    resetMockIms();
    sessionStorage.clear();
  });

  afterEach(() => {
    restoreFetch();
    sessionStorage.clear();
  });

  it('seeds projectId to the first fetched project when the config sheet left it unset', async () => {
    installFetch(globalLinkHandler([
      { projectId: 42, name: 'Marketing Site', enabled: true },
      { projectId: 43, name: 'Other Site', enabled: true },
    ]));
    const el = createOptionsEl();

    await el.loadConnectorServiceOptions();

    expect(el._siteConfig.service.envs.prod.projectId).to.equal('42');
    expect(el._options.service.projectId).to.equal('42');
    expect(el._serviceOptions[0].items).to.deep.equal([
      { value: '42', label: 'Marketing Site' },
      { value: '43', label: 'Other Site' },
    ]);
  });

  it('preserves a projectId that still matches a fetched project', async () => {
    installFetch(globalLinkHandler([
      { projectId: 42, name: 'Marketing Site', enabled: true },
      { projectId: 43, name: 'Other Site', enabled: true },
    ]));
    const el = createOptionsEl();
    el._siteConfig.service.envs.prod.projectId = '43';

    await el.loadConnectorServiceOptions();

    expect(el._siteConfig.service.envs.prod.projectId).to.equal('43');
    expect(el._options.service.projectId).to.equal('43');
  });

  it('overrides a projectId that no longer matches any fetched project', async () => {
    installFetch(globalLinkHandler([{ projectId: 42, name: 'Marketing Site', enabled: true }]));
    const el = createOptionsEl();
    el._siteConfig.service.envs.prod.projectId = '99';

    await el.loadConnectorServiceOptions();

    expect(el._siteConfig.service.envs.prod.projectId).to.equal('42');
    expect(el._options.service.projectId).to.equal('42');
  });

  it('leaves projectId unset when no projects are returned', async () => {
    installFetch(globalLinkHandler([]));
    const el = createOptionsEl();

    await el.loadConnectorServiceOptions();

    expect(el._siteConfig.service.envs.prod.projectId).to.equal(undefined);
    expect(el._serviceOptions[0].items).to.deep.equal([]);
  });

  it('falls back to disabled/empty options when connect throws', async () => {
    installFetch(() => { throw new Error('network down'); });
    const el = createOptionsEl();
    el._siteConfig.service.envs.prod.projectId = '99';

    await el.loadConnectorServiceOptions();

    expect(el._serviceOptions[0].items).to.deep.equal([]);
    expect(el._siteConfig.service.envs.prod.projectId).to.equal('99');
  });

  it('falls back to disabled/empty options when fetch throws after connect succeeds', async () => {
    installFetch((u) => {
      if (u.includes('/integrations/globallink/login')) {
        return new Response(JSON.stringify({ access_token: 'gl-token' }), { status: 200 });
      }
      if (u.includes('/rest/v0/projects')) throw new Error('network down');
      return new Response('{}', { status: 200 });
    });
    const el = createOptionsEl();

    await el.loadConnectorServiceOptions();

    expect(el._serviceOptions[0].items).to.deep.equal([]);
  });

  it('is a no-op for connectors that do not export serviceOptions', async () => {
    const el = createOptionsEl();
    el._siteConfig.service.name = 'Google';

    await el.loadConnectorServiceOptions();

    expect(el._serviceOptions).to.equal(undefined);
  });

  // Lilt has no per-env public config of its own (single fixed upstream, key resolved
  // server-side), so its config sheet never populates `service.envs.prod` - regression
  // test for the resulting bug where its static `serviceOptions` never rendered.
  it('renders static serviceOptions for a connector with no per-env config', async () => {
    installFetch((u) => {
      if (u.includes('/integrations/lilt/status')) {
        return new Response(JSON.stringify({ connected: true }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    const el = createOptionsEl();
    el._siteConfig.service = { name: 'Lilt', envs: {} };

    await el.loadConnectorServiceOptions();

    expect(el._siteConfig.service.envs.prod).to.deep.equal({ translationMode: 'ai' });
    expect(el._serviceOptions[0].items).to.deep.equal([
      { value: 'ai', label: 'AI Translation' },
      { value: 'verified', label: 'Verified Translation' },
    ]);
  });

  it('creates envs when the service config has none', async () => {
    installFetch((u) => {
      if (u.includes('/integrations/lilt/status')) {
        return new Response(JSON.stringify({ connected: true }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    const el = createOptionsEl();
    el._siteConfig.service = { name: 'Lilt' };

    await el.loadConnectorServiceOptions();

    expect(el._siteConfig.service.envs.prod).to.deep.equal({ translationMode: 'ai' });
    expect(el._serviceOptions[0].items).to.have.length(2);
  });
});

describe('filterLangsBySource', () => {
  const lang = (name, location, actions, extra = {}) => {
    const orderedActions = actions.map((value) => ({ value, name: value }));
    return { name, location, orderedActions, activeAction: orderedActions[0], ...extra };
  };

  const langs = () => [
    lang('Global English', '/global', ['rollout', 'skip']),
    lang('EU English', '/eu', ['rollout', 'skip']),
    lang('Dutch', '/nl-nl', ['translate', 'skip'], { source: '/en-nl' }),
    lang('German', '/de', ['translate', 'rollout', 'skip']),
  ];
  const names = (result) => result.map((row) => row.name);

  it('keeps rollout only for the row whose location is the root', () => {
    const result = filterLangsBySource({ langs: langs(), sourceLocation: '/eu', defaultLocation: '/global' });
    expect(names(result)).to.deep.equal(['EU English']);
  });

  it('keeps translate for rows whose source is the root', () => {
    const result = filterLangsBySource({ langs: langs(), sourceLocation: '/en-nl', defaultLocation: '/global' });
    expect(names(result)).to.deep.equal(['Dutch']);
    expect(result[0].orderedActions.map((a) => a.value)).to.deep.equal(['translate', 'skip']);
  });

  it('uses the default location for rows without a source', () => {
    const result = filterLangsBySource({ langs: langs(), sourceLocation: '/global', defaultLocation: '/global' });
    expect(names(result)).to.deep.equal(['Global English', 'German']);
  });

  it('keeps rollout on a row when translate is kept for it', () => {
    const result = filterLangsBySource({ langs: langs(), sourceLocation: '/global', defaultLocation: '/global' });
    const german = result.find((row) => row.name === 'German');
    expect(german.orderedActions.map((a) => a.value)).to.deep.equal(['translate', 'rollout', 'skip']);
  });

  it('resets the active action to the first remaining action', () => {
    const result = filterLangsBySource({
      langs: [lang('German', '/de', ['translate', 'rollout', 'skip'])],
      sourceLocation: '/de',
      defaultLocation: '/global',
    });
    expect(result[0].orderedActions.map((a) => a.value)).to.deep.equal(['rollout', 'skip']);
    expect(result[0].activeAction.value).to.equal('rollout');
  });

  it('does not mutate the supplied rows', () => {
    const input = langs();
    filterLangsBySource({ langs: input, sourceLocation: '/eu', defaultLocation: '/global' });
    expect(input).to.have.length(4);
    expect(input[0].orderedActions).to.have.length(2);
  });
});

describe('blank locales cells', () => {
  const rows = () => ([
    {
      name: 'Dutch', code: 'nl', source: '/en-nl', location: '/nl-nl', locales: '', actions: 'Translate, Skip',
    },
    { name: 'EU Rollout', code: 'en', location: '/eu', locales: '/en-nl, /en-de', actions: 'Rollout, Skip' },
  ]);

  it('formatLangs turns a blank locales cell into undefined and still splits real ones', () => {
    const [dutch, eu] = formatLangs(rows(), {});
    expect(dutch.locales).to.equal(undefined);
    expect(eu.locales.map((l) => l.code)).to.deep.equal(['/en-nl', '/en-de']);
  });

  it('finalizeOptions does not throw for a translate row with a blank locales cell', () => {
    const langs = formatLangs(rows(), {}).filter((lang) => lang.name === 'Dutch');
    const config = { service: { name: 'Google', envs: { prod: {} } } };
    const options = { 'translation.service.all.env': 'prod' };

    const { langs: result } = finalizeOptions(config, options, langs, [{ suppliedPath: '/en-nl/a' }]);

    expect(result).to.have.length(1);
    expect(result[0].action).to.equal('translate');
    expect(result[0].locales).to.equal(undefined);
  });
});

describe('finalizeOptions - project source locations', () => {
  const config = { service: { name: 'Google', envs: { prod: {} } } };
  const translateLang = () => ({
    name: 'Dutch',
    code: 'nl',
    location: '/nl',
    source: '/en-nl',
    activeAction: { value: 'translate' },
    locales: [],
  });
  const options = (location) => ({
    'translation.service.all.env': 'prod',
    'source.language': { name: 'EU English', code: 'en', location },
  });

  it('skips sync when the URL is under the detected root', () => {
    const { view } = finalizeOptions(
      config,
      options('/eu'),
      [translateLang()],
      [{ suppliedPath: '/eu/a' }],
      ['/eu'],
    );
    expect(view).to.equal('translate');
  });

  it('uses persisted locations over options and langs', () => {
    const urls = [{ suppliedPath: '/en-nl/a' }];
    const withRow = finalizeOptions(
      config,
      options('/eu'),
      [translateLang()],
      urls,
      ['/eu', '/en-nl'],
    );
    const withoutRow = finalizeOptions(
      config,
      options('/eu'),
      [translateLang()],
      urls,
      ['/eu'],
    );
    expect(withRow.view).to.equal('translate');
    expect(withoutRow.view).to.equal('sync');
  });

  it('derives locations from options and langs when none are persisted', () => {
    const { view } = finalizeOptions(
      config,
      options('/eu'),
      [translateLang()],
      [{ suppliedPath: '/en-nl/a' }],
    );
    expect(view).to.equal('translate');
  });

  it('does not treat a sibling prefix as inside the source location', () => {
    const { view } = finalizeOptions(
      config,
      options('/en'),
      [{ ...translateLang(), source: undefined }],
      [{ suppliedPath: '/en-gb/a' }],
      ['/en'],
    );
    expect(view).to.equal('sync');
  });
});

describe('getProjectSource', () => {
  const langs = [
    { name: 'Global English', code: 'en', location: '/global' },
    { name: 'EU English', code: 'en', location: '/eu' },
  ];
  const defaultSourceLang = { name: 'Global English', code: 'en', location: '/global' };
  const persisted = { name: 'EU English', code: 'en', location: '/eu' };

  it('uses the persisted source even if the URLs or config now say otherwise', () => {
    const project = { detectedSource: persisted, urls: [{ suppliedPath: '/global/a' }] };
    const result = getProjectSource({ project, enabled: false, langs, defaultSourceLang });
    expect(result).to.deep.equal({ sourceLang: persisted, detected: true });
  });

  it('keeps the configured source when validate persisted null', () => {
    const project = { detectedSource: null, urls: [{ suppliedPath: '/eu/a' }] };
    const result = getProjectSource({ project, enabled: true, langs, defaultSourceLang });
    expect(result).to.deep.equal({ sourceLang: defaultSourceLang, detected: false });
  });

  it('resolves from URLs for projects without a persisted source', () => {
    const project = { urls: [{ suppliedPath: '/eu/a' }] };
    const result = getProjectSource({ project, enabled: true, langs, defaultSourceLang });
    expect(result.detected).to.equal(true);
    expect(result.sourceLang.location).to.equal('/eu');
  });

  it('does not detect for projects without a persisted source when the flag is off', () => {
    const project = { urls: [{ suppliedPath: '/eu/a' }] };
    const result = getProjectSource({ project, enabled: false, langs, defaultSourceLang });
    expect(result.detected).to.equal(false);
  });
});

import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import '../../../../nx/blocks/loc/views/options/options.js';

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

function smartlingHandler({ projects = [], workflows = [] } = {}) {
  return (u) => {
    if (u.includes('/integrations/smartling/login')) {
      return new Response(JSON.stringify({
        response: { data: { accessToken: 'sl-token', refreshToken: 'sl-refresh' } },
      }), { status: 200 });
    }
    if (u.includes('/projects-api/v2/projects/proj-1')) {
      return new Response(JSON.stringify({
        response: { data: { accountUid: 'acct-1' } },
      }), { status: 200 });
    }
    if (u.includes('/accounts-api/v2/accounts/acct-1/projects')) {
      return new Response(JSON.stringify({
        response: { data: { items: projects } },
      }), { status: 200 });
    }
    if (u.includes('/workflows-api/v3/accounts/acct-1/workflows')) {
      return new Response(JSON.stringify({
        response: { data: { items: workflows } },
      }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
}

function createSmartlingOptionsEl() {
  const el = document.createElement('nx-loc-options');
  el.project = { org, site, urls: [] };
  el._siteOptions = { 'translation.service.all.env': 'prod' };
  el._siteLangs = [{ code: 'fr', activeAction: { value: 'translate' } }];
  el._siteConfig = {
    service: {
      name: 'Smartling',
      envs: { prod: { origin: 'https://api.smartling.com', projectId: 'proj-1' } },
    },
  };
  return el;
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
});

describe('NxLocOptions - Smartling autoAuthorize default', () => {
  beforeEach(() => {
    resetMockIms();
    sessionStorage.clear();
  });

  afterEach(() => {
    restoreFetch();
    sessionStorage.clear();
  });

  it('preserves autoAuthorize=yes from the config sheet as the enabled selection', async () => {
    installFetch(smartlingHandler({
      projects: [{ projectId: 'proj-1', projectName: 'Marketing Site', archived: false }],
    }));
    const el = createSmartlingOptionsEl();
    el._siteConfig.service.envs.prod.autoAuthorize = 'yes';

    await el.loadConnectorServiceOptions();

    expect(el._siteConfig.service.envs.prod.autoAuthorize).to.equal('yes');
    expect(el._options.service.autoAuthorize).to.equal('yes');
  });

  it('preserves autoAuthorize=no from the config sheet as the disabled selection', async () => {
    installFetch(smartlingHandler({
      projects: [{ projectId: 'proj-1', projectName: 'Marketing Site', archived: false }],
    }));
    const el = createSmartlingOptionsEl();
    el._siteConfig.service.envs.prod.autoAuthorize = 'no';

    await el.loadConnectorServiceOptions();

    expect(el._siteConfig.service.envs.prod.autoAuthorize).to.equal('no');
    expect(el._options.service.autoAuthorize).to.equal('no');
  });

  it('defaults to disabled when the config sheet leaves autoAuthorize unset', async () => {
    installFetch(smartlingHandler({
      projects: [{ projectId: 'proj-1', projectName: 'Marketing Site', archived: false }],
    }));
    const el = createSmartlingOptionsEl();

    await el.loadConnectorServiceOptions();

    expect(el._siteConfig.service.envs.prod.autoAuthorize).to.equal('no');
    expect(el._options.service.autoAuthorize).to.equal('no');
  });
});

describe('NxLocOptions - renderServiceOption enabledWhen', () => {
  function renderOption(el, option) {
    const container = document.createElement('div');
    render(el.renderServiceOption(option), container);
    return container;
  }

  it('renders a disabled "Not applicable" select when enabledWhen returns false', () => {
    const el = createOptionsEl();
    el._siteConfig.service.envs.prod.autoAuthorize = 'no';
    const option = {
      key: 'workflowUid',
      label: 'Workflow',
      items: [{ value: 'wf-1', label: 'Default' }],
      enabledWhen: (envConfig) => envConfig?.autoAuthorize === 'yes',
    };

    const container = renderOption(el, option);

    const select = container.querySelector('sl-select');
    expect(select.hasAttribute('disabled')).to.equal(true);
    expect(select.textContent.trim()).to.equal('Not applicable');
  });

  it('renders the normal populated select when enabledWhen returns true', () => {
    const el = createOptionsEl();
    el._siteConfig.service.envs.prod.autoAuthorize = 'yes';
    const option = {
      key: 'workflowUid',
      label: 'Workflow',
      items: [{ value: 'wf-1', label: 'Default' }],
      enabledWhen: (envConfig) => envConfig?.autoAuthorize === 'yes',
    };

    const container = renderOption(el, option);

    const select = container.querySelector('sl-select');
    expect(select.hasAttribute('disabled')).to.equal(false);
    expect(select.querySelectorAll('option')).to.have.lengthOf(1);
  });

  it('ignores enabledWhen for options that do not define it', () => {
    const el = createOptionsEl();
    const option = {
      key: 'projectId',
      label: 'Project',
      items: [{ value: '42', label: 'Marketing Site' }],
    };

    const container = renderOption(el, option);

    const select = container.querySelector('sl-select');
    expect(select.hasAttribute('disabled')).to.equal(false);
  });
});

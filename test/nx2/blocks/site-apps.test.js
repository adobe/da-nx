import { expect } from '@esm-bundle/chai';
import init from '../../../nx/blocks/site-apps/site-apps.js';
import { AEM_API, DA_ADMIN, HLX_ADMIN } from '../../../nx2/utils/utils.js';
import {
  calls, installFetch, restoreFetch,
} from '../../../nx2/test/mocks/fetch.js';

describe('site apps config routing', () => {
  let section;
  let block;
  let originalHref;

  beforeEach(() => {
    originalHref = window.location.href;
    section = document.createElement('section');
    section.className = 'section';
    block = document.createElement('div');
    section.append(block);
    document.body.append(section);
  });

  afterEach(() => {
    restoreFetch();
    section.remove();
    history.replaceState(null, '', originalHref);
  });

  const apps = [{
    title: 'Test app', description: 'Test description', path: '/apps/test', image: '/nx/img/favicon.svg',
  }];

  it('loads legacy apps from the legacy site config', async () => {
    const org = 'site-apps-legacy';
    const site = 'site';
    history.replaceState(null, '', `/apps#/${org}/${site}`);
    installFetch({ body: JSON.stringify({ apps: { data: apps } }) });

    await init(block);

    expect(block.querySelector('h3').textContent).to.equal('Test app');
    expect(calls.map((call) => call.url)).to.deep.equal([
      `${HLX_ADMIN}/ping/${org}/${site}`,
      `${DA_ADMIN}/config/${org}/${site}/`,
    ]);
  });

  it('loads a single-sheet hlx6 apps config without requesting legacy config', async () => {
    const org = 'site-apps-hlx6';
    const site = 'site';
    history.replaceState(null, '', `/apps#/${org}/${site}`);
    installFetch({ pingHlx6: true, body: JSON.stringify({ apps }) });

    await init(block);

    expect(block.querySelector('h3').textContent).to.equal('Test app');
    expect(calls.map((call) => call.url)).to.deep.equal([
      `${HLX_ADMIN}/ping/${org}/${site}`,
      `${AEM_API}/${org}/sites/${site}/config/editor/da.json`,
    ]);
  });
});

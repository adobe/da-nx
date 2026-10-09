import { expect } from '@esm-bundle/chai';
import { AEM_API, DA_ADMIN } from '../../../../nx2/utils/utils.js';
import {
  calls, installFetch, restoreFetch, lastCall,
} from '../../../nx2/mocks/fetch.js';
// eslint-disable-next-line import/no-unresolved
import { getOrgSite, loadDocSource } from '../../../../nx/blocks/quick-edit-portal/src/source.js';

const STORAGE_KEY = 'hlx6-upgrade';

let counter = 0;
const makeOrgSite = ({ hlx6 = false } = {}) => {
  counter += 1;
  const org = `qe-org-${counter}-${Math.floor(Math.random() * 1e6)}`;
  const site = `qe-site-${counter}`;
  if (hlx6) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}),
      [`/${org}/${site}`]: true,
    }));
  }
  return { org, site };
};

describe('quick-edit portal source', () => {
  afterEach(() => restoreFetch());

  describe('getOrgSite', () => {
    it('reads org and site from a da content mountpoint', () => {
      expect(getOrgSite('https://content.da.live/scdemos/demo/')).to.deep.equal({
        org: 'scdemos', site: 'demo',
      });
    });

    it('reads org and site from a source bus mountpoint', () => {
      expect(getOrgSite('https://api.aem.live/scdemos/sites/demo-hlx6/source')).to.deep.equal({
        org: 'scdemos', site: 'demo-hlx6',
      });
    });

    it('reads org and site from a source bus mountpoint with a trailing slash', () => {
      expect(getOrgSite('https://api.aem.live/scdemos/sites/demo-hlx6/source/')).to.deep.equal({
        org: 'scdemos', site: 'demo-hlx6',
      });
    });

    it('returns no site for a mountpoint without one', () => {
      expect(getOrgSite('https://content.da.live/scdemos/').site).to.equal(undefined);
    });
  });

  describe('loadDocSource', () => {
    it('uses the source bus url on hlx6, the same url the da-live canvas names its room with', async () => {
      installFetch();
      const { org, site } = makeOrgSite({ hlx6: true });
      const result = await loadDocSource({ org, site, pathname: '/drafts/page' });

      const expected = `${AEM_API}/${org}/sites/${site}/source/drafts/page.html`;
      expect(result.sourceUrl).to.equal(expected);
      expect(lastCall().url).to.equal(expected);
      expect(lastCall().method).to.equal('HEAD');
      expect(result.permissions).to.deep.equal(['read', 'write']);
      expect(calls.some((c) => c.url.startsWith(DA_ADMIN))).to.equal(false);
    });

    it('uses the da-admin source url on legacy sites', async () => {
      installFetch({ headers: { 'x-da-actions': '/org/site/drafts/page.html=read' } });
      const { org, site } = makeOrgSite();
      const result = await loadDocSource({ org, site, pathname: '/drafts/page' });

      const expected = `${DA_ADMIN}/source/${org}/${site}/drafts/page.html`;
      expect(result.sourceUrl).to.equal(expected);
      expect(lastCall().url).to.equal(expected);
      expect(result.permissions).to.deep.equal(['read']);
    });

    it('keeps read and write when a legacy response has no permission hints', async () => {
      installFetch();
      const { org, site } = makeOrgSite();
      const { permissions } = await loadDocSource({ org, site, pathname: '/page' });
      expect(permissions).to.deep.equal(['read', 'write']);
    });

    it('maps a folder path to its index document', async () => {
      installFetch();
      const { org, site } = makeOrgSite({ hlx6: true });
      const { sourceUrl } = await loadDocSource({ org, site, pathname: '/drafts/' });
      expect(sourceUrl).to.equal(`${AEM_API}/${org}/sites/${site}/source/drafts/index.html`);
    });

    it('maps the root path to the index document', async () => {
      installFetch();
      const { org, site } = makeOrgSite();
      const { sourceUrl } = await loadDocSource({ org, site, pathname: '/' });
      expect(sourceUrl).to.equal(`${DA_ADMIN}/source/${org}/${site}/index.html`);
    });

    it('returns an error with the status when the document cannot be read', async () => {
      installFetch({ status: 403 });
      const { org, site } = makeOrgSite();
      const result = await loadDocSource({ org, site, pathname: '/page' });
      expect(result.status).to.equal(403);
      expect(result.error).to.be.a('string');
      expect(result.sourceUrl).to.equal(undefined);
    });
  });
});

import { expect } from '@esm-bundle/chai';
import nxGetPrefixDetails from '../../../../../nx/public/plugins/rollout/index.js';
import nx2GetPrefixDetails from '../../../../../nx2/public/plugins/rollout/index.js';

const CONFIG = {
  config: { data: [{ key: 'source.language', value: 'English' }] },
  languages: {
    data: [
      { name: 'English', location: '/', locales: '/en-us, /en-ca' },
      { name: 'French', location: '/fr-fr', locales: '/fr-ca' },
      { name: 'German', location: '/de' },
    ],
  },
};

/**
 * Build a translate config with the given languages.
 * @param {object[]} data - Language rows.
 * @param {object} [config] - Config sheet.
 * @returns {object} Translate config.
 */
const withLanguages = (data, config = CONFIG.config) => ({ config, languages: { data } });

describe('Rollout plugin getPrefixDetails', () => {
  const originalFetch = window.fetch;

  /**
   * Stub fetch to return the given config JSON.
   * @param {object} conf - Translate config.
   */
  const mockConf = (conf) => {
    window.fetch = async () => ({ json: async () => conf });
  };

  afterEach(() => {
    window.fetch = originalFetch;
  });

  [
    ['nx', nxGetPrefixDetails],
    ['nx2', nx2GetPrefixDetails],
  ].forEach(([name, getPrefixDetails]) => {
    describe(name, () => {
      const run = (path) => getPrefixDetails('org', 'repo', 'token', path);

      it('Returns null when the translate config cannot be fetched', async () => {
        window.fetch = async () => { throw new Error('network'); };
        expect(await run('/page')).to.be.null;
      });

      it('Lists the source language locales for a root page', async () => {
        mockConf(CONFIG);
        const details = await run('/page');
        expect(details.currPrefix).to.equal('/');
        expect(details.prefixes.map((p) => p.path)).to.deep.equal(['/en-us', '/en-ca']);
        expect(details.prefixes[0]).to.deep.include({
          active: true,
          source: '/org/repo/page.html',
          destination: '/org/repo/en-us/page.html',
          edit: '/org/repo/en-us/page',
        });
      });

      it('Returns no prefixes for a root page when the source language has no locales', async () => {
        mockConf(withLanguages([{ name: 'English', location: '/' }]));
        expect(await run('/page')).to.deep.equal({ currPrefix: '/', prefixes: [] });
      });

      it('Returns no prefixes for a root page when the source language locales are empty', async () => {
        mockConf(withLanguages([{ name: 'English', location: '/', locales: '' }]));
        expect(await run('/page')).to.deep.equal({ currPrefix: '/', prefixes: [] });
      });

      it('Lists the language locales for a page under a language location', async () => {
        mockConf(CONFIG);
        const details = await run('/fr-fr/page');
        expect(details.currPrefix).to.equal('/fr-fr');
        expect(details.prefixes).to.have.length(1);
        expect(details.prefixes[0]).to.deep.include({
          path: '/fr-ca',
          source: '/org/repo/fr-fr/page.html',
          destination: '/org/repo/fr-ca/page.html',
        });
      });

      it('Returns no prefixes for a page under a language without locales', async () => {
        mockConf(CONFIG);
        expect(await run('/de/page')).to.deep.equal({ currPrefix: '/de', prefixes: [] });
      });

      it('Flags a page under a locale', async () => {
        mockConf(CONFIG);
        expect(await run('/en-ca/page')).to.deep.equal({
          currPrefix: '/en-ca',
          prefixes: [],
          isLocale: true,
        });
      });

      it('Returns no prefixes when no source language is configured', async () => {
        mockConf({ ...CONFIG, config: { data: [] } });
        expect(await run('/page')).to.deep.equal({ currPrefix: null, prefixes: [] });
      });

      it('Returns no prefixes when the source language is not in the languages sheet', async () => {
        mockConf(withLanguages([{ name: 'French', location: '/fr-fr', locales: '/fr-ca' }]));
        expect(await run('/page')).to.deep.equal({ currPrefix: null, prefixes: [] });
      });
    });
  });
});

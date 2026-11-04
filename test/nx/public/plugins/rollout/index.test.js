import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import getPrefixDetails from '../../../../../nx/public/plugins/rollout/index.js';
import getPrefixDetailsNx2 from '../../../../../nx2/public/plugins/rollout/index.js';

const sheet = (data) => ({ data });
const conf = (behavior) => ({
  config: sheet(behavior ? [{ key: 'rollout.conflict.behavior', value: behavior }] : []),
  languages: sheet([{ name: 'English', location: '/en', locales: '/apac, /emea' }]),
});

[['nx', getPrefixDetails], ['nx2', getPrefixDetailsNx2]].forEach(([name, fn]) => {
  describe(`${name} rollout plugin getPrefixDetails`, () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      sinon.restore();
    });

    const run = (json) => {
      globalThis.fetch = sinon.stub().resolves({ ok: true, json: async () => json });
      return fn('org', 'site', 'token', '/en/page');
    };

    it('enables smart overwrite only when listed in the site config', async () => {
      expect((await run(conf('merge, overwrite, smart-overwrite'))).smartOverwrite).to.be.true;
      expect((await run(conf('merge, overwrite'))).smartOverwrite).to.be.false;
      expect((await run(conf())).smartOverwrite).to.be.false;
    });

    it('keeps the existing prefix details', async () => {
      const details = await run(conf('smart-overwrite'));
      expect(details.currPrefix).to.equal('/en');
      expect(details.prefixes.map((prefix) => prefix.destination))
        .to.deep.equal(['/org/site/apac/page.html', '/org/site/emea/page.html']);
    });
  });
});

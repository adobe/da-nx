import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import getPrefixDetails, { rolloutPrefix } from '../../../../../nx/public/plugins/rollout/index.js';
import getPrefixDetailsNx2, { rolloutPrefix as rolloutPrefixNx2 } from '../../../../../nx2/public/plugins/rollout/index.js';

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

[['nx', rolloutPrefix], ['nx2', rolloutPrefixNx2]].forEach(([name, fn]) => {
  describe(`${name} rollout plugin rolloutPrefix`, () => {
    const copyFns = () => ({
      merge: sinon.stub().resolves({ ok: true }),
      overwrite: sinon.stub().resolves({ ok: true }),
      'smart-overwrite': sinon.stub().callsFake(async (prefix) => {
        prefix.baselineOnly = true;
        return { ok: true };
      }),
    });

    it('dispatches to the copy function for the chosen behavior', async () => {
      const fns = copyFns();
      const prefix = { path: '/apac' };
      await fn({
        prefix, behavior: 'smart-overwrite', label: 'Proj', copyFns: fns,
      });
      expect(fns['smart-overwrite'].calledOnceWith(prefix, 'Proj')).to.be.true;
      expect(fns.merge.called).to.be.false;
      expect(prefix.root).to.equal('/apac');
      expect(prefix.baselineOnly).to.be.true;
    });

    it('falls back to merge for unknown behaviors', async () => {
      const fns = copyFns();
      await fn({
        prefix: { path: '/apac' }, behavior: 'merge', label: 'Proj', copyFns: fns,
      });
      await fn({
        prefix: { path: '/apac' }, behavior: 'unknown', label: 'Proj', copyFns: fns,
      });
      await fn({
        prefix: { path: '/apac' }, behavior: 'constructor', label: 'Proj', copyFns: fns,
      });
      expect(fns.merge.calledThrice).to.be.true;
    });

    it('clears notes from a previous rollout', async () => {
      const fns = copyFns();
      const prefix = { path: '/apac', skipped: 2, baselineOnly: true };
      await fn({
        prefix, behavior: 'overwrite', label: 'Proj', copyFns: fns,
      });
      expect(prefix).to.not.have.property('skipped');
      expect(prefix).to.not.have.property('baselineOnly');
    });

    it('marks the destination as errored without copying when the source cannot be prepared', async () => {
      const fns = copyFns();
      const prefix = { path: '/apac' };
      const resolver = { prepareSource: sinon.stub().resolves({ error: 'Missing placeholders' }) };
      await fn({
        prefix, behavior: 'smart-overwrite', label: 'Proj', resolver, copyFns: fns,
      });
      expect(prefix.status).to.equal('error');
      expect(prefix.error).to.equal('Missing placeholders');
      expect(fns['smart-overwrite'].called).to.be.false;
    });
  });
});

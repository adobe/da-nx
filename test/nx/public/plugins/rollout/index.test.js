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
      mergeCopy: sinon.stub().resolves({ ok: true }),
      overwriteCopy: sinon.stub().resolves({ ok: true }),
      smartOverwriteCopy: sinon.stub().callsFake(async (prefix) => {
        prefix.skipped = 1;
        return { ok: true };
      }),
      markInSync: sinon.stub().callsFake(async (prefix) => {
        prefix.status = 'success';
        prefix.sync = prefix.skipAs || (prefix.sync ? 'stale' : 'marked');
        return { ok: true };
      }),
    });

    it('dispatches to the copy function for the chosen behavior', async () => {
      const fns = copyFns();
      const prefix = { path: '/apac' };
      await fn({
        prefix, behavior: 'smart-overwrite', label: 'Proj', copy: fns,
      });
      expect(fns.smartOverwriteCopy.calledOnceWith(prefix, 'Proj')).to.be.true;
      expect(fns.mergeCopy.called).to.be.false;
      expect(prefix.root).to.equal('/apac');
      expect(prefix.skipped).to.equal(1);
    });

    it('asks plain merge and overwrite to record the smart-overwrite baseline', async () => {
      const fns = copyFns();
      await fn({
        prefix: { path: '/apac' }, behavior: 'merge', label: 'Proj', copy: fns,
      });
      await fn({
        prefix: { path: '/apac' }, behavior: 'overwrite', label: 'Proj', copy: fns,
      });
      expect(fns.mergeCopy.firstCall.args[2]).to.deep.equal({ recordBaseline: true });
      expect(fns.overwriteCopy.firstCall.args[2]).to.deep.equal({ recordBaseline: true });
    });

    it('marks the destination in sync without copying', async () => {
      const fns = copyFns();
      const prefix = { path: '/apac', sync: 'in-sync' };
      await fn({
        prefix, behavior: 'mark-in-sync', label: 'Proj', copy: fns,
      });
      expect(fns.markInSync.firstCall.args).to.deep.equal([prefix]);
      expect(prefix.sync).to.equal('marked');
      const copies = [fns.mergeCopy, fns.overwriteCopy, fns.smartOverwriteCopy];
      const copied = copies.some((stub) => stub.called);
      expect(copied).to.be.false;
    });

    it('shows pages skipped by mark in sync as neutral and passes no options to smart overwrite', async () => {
      const fns = copyFns();
      const skipped = { path: '/apac', skipAs: 'in-sync' };
      await fn({
        prefix: skipped, behavior: 'mark-in-sync', label: 'Proj', copy: fns,
      });
      expect(skipped.status).to.equal('none');
      await fn({
        prefix: { path: '/apac' }, behavior: 'smart-overwrite', label: 'Proj', copy: fns,
      });
      expect(fns.smartOverwriteCopy.firstCall.args[2]).to.be.undefined;
    });

    it('falls back to merge for unknown behaviors', async () => {
      const fns = copyFns();
      await fn({
        prefix: { path: '/apac' }, behavior: 'merge', label: 'Proj', copy: fns,
      });
      await fn({
        prefix: { path: '/apac' }, behavior: 'unknown', label: 'Proj', copy: fns,
      });
      await fn({
        prefix: { path: '/apac' }, behavior: 'constructor', label: 'Proj', copy: fns,
      });
      expect(fns.mergeCopy.calledThrice).to.be.true;
    });

    it('clears notes from a previous rollout', async () => {
      const fns = copyFns();
      const prefix = { path: '/apac', skipped: 2 };
      await fn({
        prefix, behavior: 'overwrite', label: 'Proj', copy: fns,
      });
      expect(prefix).to.not.have.property('skipped');
    });

    it('marks the destination as errored without copying when the source cannot be prepared', async () => {
      const fns = copyFns();
      const prefix = { path: '/apac' };
      const resolver = { prepareSource: sinon.stub().resolves({ error: 'Missing placeholders' }) };
      await fn({
        prefix, behavior: 'smart-overwrite', label: 'Proj', resolver, copy: fns,
      });
      expect(prefix.status).to.equal('error');
      expect(prefix.error).to.equal('Missing placeholders');
      expect(fns.smartOverwriteCopy.called).to.be.false;
    });
  });
});

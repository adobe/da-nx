import { expect } from '@esm-bundle/chai';
import {
  sanitizeFixtureName, loadEvalFixture, injectEvalFixture, loadEpisodesThenInject,
} from '../../../../../nx2/blocks/chat-ao/dev/eval-fixture.js';

describe('eval fixture switch', () => {
  describe('sanitizeFixtureName', () => {
    it('keeps [a-z0-9.-] only', () => {
      expect(sanitizeFixtureName('frescopa-draft.nested')).to.equal('frescopa-draft.nested');
      expect(sanitizeFixtureName('Frescopa Draft/../../x?y=1')).to.equal('frescopadraft.xy1');
      expect(sanitizeFixtureName('..%2f..%2fetc')).to.equal('2f.2fetc');
    });

    it('returns an empty string for missing or fully stripped names', () => {
      expect(sanitizeFixtureName(null)).to.equal('');
      expect(sanitizeFixtureName('///')).to.equal('');
    });
  });

  describe('loadEvalFixture', () => {
    it('returns undefined without the param', async () => {
      expect(await loadEvalFixture({ search: '?foo=1' })).to.equal(undefined);
    });

    it('loads the flat and the nested fixture files', async () => {
      const flat = await loadEvalFixture({ search: '?nx-eval-fixture=frescopa-draft' });
      expect(flat.a2ui_surface.components[0]).to.include({ id: 'root', component: 'PageEvaluationWithIcons' });

      const nested = await loadEvalFixture({ search: '?nx-eval-fixture=frescopa-draft.nested' });
      expect(nested.a2ui_surface.components[0].type).to.equal('PageEvaluationWithIcons');
    });

    it('warns and returns undefined for a missing fixture', async () => {
      const original = console.warn;
      const warnings = [];
      console.warn = (...args) => warnings.push(args);
      try {
        expect(await loadEvalFixture({ search: '?nx-eval-fixture=does-not-exist' })).to.equal(undefined);
      } finally {
        console.warn = original;
      }
      expect(warnings).to.have.length(1);
    });
  });

  describe('loadEpisodesThenInject', () => {
    const options = { search: '?nx-eval-fixture=frescopa-draft' };

    it('injects after loadEpisodes resolves', async () => {
      const calls = [];
      const controller = {
        loadEpisodes: async () => { calls.push('load'); },
        appendMessage: () => calls.push('append'),
      };
      await loadEpisodesThenInject(controller, options);
      expect(calls).to.deep.equal(['load', 'append']);
    });

    it('still injects, clears the loading spinner and rethrows when loadEpisodes rejects', async () => {
      const messages = [];
      const controller = {
        loadEpisodes: async () => { throw new Error('CORS'); },
        appendMessage: (m, opts) => messages.push({ m, opts }),
      };
      let error;
      try {
        await loadEpisodesThenInject(controller, options);
      } catch (e) {
        error = e;
      }
      expect(error.message).to.equal('CORS');
      expect(messages).to.have.length(1);
      expect(messages[0].opts).to.deep.equal({ stopLoading: true });
    });
  });

  describe('injectEvalFixture', () => {
    it('appends the fixture as an assistant uiArtifact once per controller', async () => {
      const messages = [];
      const controller = { appendMessage: (m) => messages.push(m) };
      const options = { search: '?nx-eval-fixture=frescopa-draft' };

      await injectEvalFixture(controller, options);
      await injectEvalFixture(controller, options);

      expect(messages).to.have.length(1);
      expect(messages[0].role).to.equal('assistant');
      expect(messages[0].uiArtifact.components[0].component).to.equal('PageEvaluationWithIcons');
    });

    it('appends nothing when the fixture cannot be loaded', async () => {
      const messages = [];
      await injectEvalFixture({ appendMessage: (m) => messages.push(m) }, { search: '' });
      expect(messages).to.deep.equal([]);
    });
  });
});

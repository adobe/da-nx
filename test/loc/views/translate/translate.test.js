import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../../../nx/utils/daFetch.js';
import '../../../../nx/blocks/loc/views/translate/translate.js';

function createTranslateEl() {
  const el = document.createElement('nx-loc-translate');
  // Stand-in for renderRoot, avoiding connectedCallback's service setup.
  el.renderRoot = document.createElement('div');
  return el;
}

describe('NxLocTranslate - update() message guard', () => {
  it('keeps a local connector error visible through an incidental parent message prop change', () => {
    const el = createTranslateEl();
    el._message = { text: 'Failed to save/start GlobalLink submission.', type: 'error' };
    el.message = undefined;

    el.update(new Map([['message', { text: 'Saving...' }]]));

    expect(el._message).to.deep.equal({ text: 'Failed to save/start GlobalLink submission.', type: 'error' });
  });

  it('keeps a local error through the parent transient "Saving..." message', () => {
    const el = createTranslateEl();
    el._message = { text: 'Connector failed.', type: 'error' };
    el.message = { text: 'Saving...', transient: true };

    el.update(new Map([['message', undefined]]));

    expect(el._message).to.deep.equal({ text: 'Connector failed.', type: 'error' });
  });

  it('replaces a local error with a non-error parent message', () => {
    const el = createTranslateEl();
    el._message = { text: 'Connector failed.', type: 'error' };
    el.message = { text: 'Project loaded.' };

    el.update(new Map([['message', undefined]]));

    expect(el._message).to.deep.equal({ text: 'Project loaded.' });
  });

  it('still applies a newer error pushed down from the parent', () => {
    const el = createTranslateEl();
    el._message = { text: 'Failed to save/start GlobalLink submission.', type: 'error' };
    el.message = { text: 'A different error occurred.', type: 'error' };

    el.update(new Map([['message', { text: 'Saving...' }]]));

    expect(el._message).to.deep.equal({ text: 'A different error occurred.', type: 'error' });
  });

  it('syncs down the parent message as usual when there is no local error', () => {
    const el = createTranslateEl();
    el._message = { text: 'Saving...' };
    el.message = undefined;

    el.update(new Map([['message', { text: 'Saving...' }]]));

    expect(el._message).to.equal(undefined);
  });
});

describe('NxLocTranslate - Send All retry', () => {
  [false, true].forEach((managed) => {
    it(`clears the previous error before retrying with managed status ${managed}`, async () => {
      const el = createTranslateEl();
      el._service = { connector: { supportsManagedStatus: managed } };
      el._message = { text: 'Previous submission failed.', type: 'error' };
      const state = {};
      const failure = new Error('Could not prepare translation.');
      el.getBaseTranslationConf = async () => {
        state.message = el._message;
        state.busy = el._sendAllBusy;
        throw failure;
      };

      await el.handleSendAll().catch((error) => {
        expect(error).to.equal(failure);
      });

      expect(state.message).to.equal(undefined);
      expect(state.busy).to.equal(true);
      expect(el._sendAllBusy).to.equal(false);
      expect(el._message).to.deep.equal(managed
        ? { text: failure.message, type: 'error' }
        : undefined);
    });
  });
});

describe('NxLocTranslate - waiting language errors', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    window.location.hash = '#/org/site';
    globalThis.fetch = sinon.stub().callsFake(async (url) => {
      if (url.includes('/.da/translate')) {
        const json = async () => ({ config: { data: [] } });
        return { ok: true, status: 200, headers: new Headers(), json };
      }
      const text = async () => '<p class="da-diff-added">hola</p>';
      return { ok: true, status: 200, headers: new Headers(), text };
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('shows an error when a dependent language source has unmerged changes', async () => {
    const el = createTranslateEl();
    const connector = {
      dnt: { addDnt: async (c) => c },
      sendAllLanguages: sinon.stub().resolves(),
    };
    const urls = [{ suppliedPath: '/en/page' }];
    const catalan = {
      name: 'Catalan',
      code: 'ca',
      waitingFor: { name: 'Spanish', code: 'es', location: '/es' },
      translation: { status: 'waiting' },
    };
    const conf = {
      org: 'org',
      site: 'site',
      urls,
      langs: [{ name: 'Spanish', code: 'es', translation: { status: 'complete', saved: 1 } }, catalan],
      options: {},
      sourceLocations: ['/en'],
    };
    el._service = { connector };
    el._translateLangs = [];
    el._options = {};
    el._urls = urls;

    await el.checkAndSaveLangs(conf);

    expect(connector.sendAllLanguages.called).to.be.false;
    expect(el._message).to.deep.equal({
      text: 'Catalan is waiting on Spanish: /page.html has unmerged changes. Please resolve before translating.',
      type: 'error',
    });
  });
});

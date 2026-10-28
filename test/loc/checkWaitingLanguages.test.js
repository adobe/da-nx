import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { checkWaitingLanguages } from '../../nx/blocks/loc/views/translate/index.js';

const SOURCE = { name: 'English', code: 'en-US', location: '/en' };
const FRENCH = { name: 'French', code: 'fr-FR', location: '/fr' };
const URLS = [{ suppliedPath: '/en/page' }];

function makeConf({ sourceLanguage = SOURCE, sendAllLanguages } = {}) {
  const sendMessage = sinon.spy();
  const saveState = sinon.stub().resolves();
  const lang = {
    name: 'French Canada',
    code: 'fr-CA',
    waitingFor: FRENCH,
    translation: { status: 'waiting' },
  };
  const french = { ...FRENCH, translation: { saved: 1 } };
  const options = { service: { orderIds: {} } };
  if (sourceLanguage) options['source.language'] = sourceLanguage;

  const connector = {
    dnt: { addDnt: async (content) => content },
    sendAllLanguages: sinon.stub().callsFake(sendAllLanguages),
  };
  const conf = {
    org: 'org',
    site: 'site',
    options,
    langs: [french, lang],
    urls: URLS,
    actions: { sendMessage, saveState },
  };
  return { conf, connector, lang, sendMessage, saveState };
}

describe('checkWaitingLanguages', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    window.location.hash = '#/org/site';
    globalThis.fetch = sinon.stub().callsFake(async (url) => {
      const body = String(url).includes('/.da/translate')
        ? { config: { data: [] } }
        : '<p>hello</p>';
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => body,
        text: async () => body,
      };
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('submits a ready dependent language with its own source language', async () => {
    const { conf, connector, lang } = makeConf({
      sendAllLanguages: async ({ langs }) => { langs[0].translation.status = 'created'; },
    });

    await checkWaitingLanguages(conf, connector, URLS, '/en');

    const sent = connector.sendAllLanguages.firstCall.args[0];
    expect(sent.options['source.language']).to.equal(FRENCH);
    expect(lang.translation.status).to.equal('created');
    expect(lang.waitingFor).to.equal(undefined);
  });

  it('restores waiting and keeps the error when the connector reports one', async () => {
    const { conf, connector, lang, sendMessage } = makeConf({
      sendAllLanguages: async ({ actions }) => {
        actions.sendMessage({ text: 'Unsupported code', type: 'error' });
      },
    });

    await checkWaitingLanguages(conf, connector, URLS, '/en');

    expect(lang.translation.status).to.equal('waiting');
    expect(lang.waitingFor).to.equal(FRENCH);
    expect(sendMessage.calledWithMatch({ type: 'error', text: 'Unsupported code' })).to.equal(true);
  });

  it('restores waiting and reports an error when the connector throws', async () => {
    const { conf, connector, lang, sendMessage } = makeConf({
      sendAllLanguages: async () => { throw new Error('boom'); },
    });

    await checkWaitingLanguages(conf, connector, URLS, '/en');

    expect(lang.translation.status).to.equal('waiting');
    expect(lang.waitingFor).to.equal(FRENCH);
    expect(sendMessage.calledWithMatch({ type: 'error', text: 'Unable to submit French Canada: boom' })).to.equal(true);
  });

  it('does not persist the source language override', async () => {
    const { conf, connector, saveState } = makeConf({
      sendAllLanguages: async ({ options, actions }) => {
        await actions.saveState({ options });
      },
    });

    await checkWaitingLanguages(conf, connector, URLS, '/en');

    expect(saveState.firstCall.args[0].options['source.language']).to.equal(SOURCE);
  });

  it('drops the override when the project has no source language', async () => {
    const { conf, connector, saveState } = makeConf({
      sourceLanguage: null,
      sendAllLanguages: async ({ options, actions }) => {
        await actions.saveState({ options });
      },
    });

    await checkWaitingLanguages(conf, connector, URLS);

    expect(saveState.firstCall.args[0].options).to.not.have.property('source.language');
  });
});

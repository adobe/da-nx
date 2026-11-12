import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { checkWaitingLanguages } from '../../nx/blocks/loc/views/translate/index.js';

const ORG = 'org';
const SITE = 'site';

/**
 * Stubs da-admin: empty translate config, and every source page returns `content`.
 * @param {string} content - Source page HTML.
 * @returns {sinon.SinonStub} The fetch stub.
 */
function stubFetch(content) {
  return sinon.stub().callsFake(async (url) => {
    if (url.includes('/.da/translate')) {
      const json = async () => ({ config: { data: [] } });
      return { ok: true, status: 200, headers: new Headers(), json };
    }
    return { ok: true, status: 200, headers: new Headers(), text: async () => content };
  });
}

/**
 * Builds a conf with a saved Spanish source and a Catalan language waiting on it.
 * @returns {{ conf: Object, catalan: Object }} The conf and the waiting language.
 */
function makeConf() {
  const spanish = { name: 'Spanish', code: 'es', location: '/es', translation: { status: 'complete', saved: 1 } };
  const catalan = {
    name: 'Catalan',
    code: 'ca',
    location: '/ca',
    waitingFor: { name: 'Spanish', code: 'es', location: '/es' },
    translation: { status: 'waiting' },
  };
  const urls = [{ suppliedPath: '/en/page' }];
  const conf = {
    org: ORG,
    site: SITE,
    urls,
    langs: [spanish, catalan],
    options: {},
    sourceLocations: ['/en'],
  };
  return { conf, catalan };
}

/**
 * Builds a connector stub that passes content through DNT.
 * @returns {Object} The connector.
 */
function makeConnector() {
  return {
    dnt: { addDnt: async (content) => content },
    sendAllLanguages: sinon.stub().resolves(),
  };
}

describe('checkWaitingLanguages', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    window.location.hash = `#/${ORG}/${SITE}`;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('sends a waiting language once its source language is saved', async () => {
    globalThis.fetch = stubFetch('<p>hola</p>');
    const { conf, catalan } = makeConf();
    const connector = makeConnector();

    const { errors } = await checkWaitingLanguages(conf, connector, conf.urls, '/en');

    expect(errors).to.deep.equal([]);
    expect(connector.sendAllLanguages.calledOnce).to.be.true;
    const [sent] = connector.sendAllLanguages.firstCall.args;
    expect(sent.langs).to.deep.equal([catalan]);
    expect(sent.options['source.language']).to.include({ code: 'es' });
    expect(sent.urls[0].content).to.equal('<p>hola</p>');
    expect(catalan.translation.status).to.equal('not started');
    expect(catalan.waitingFor).to.be.undefined;
  });

  it('keeps the language waiting when source pages have unmerged changes', async () => {
    globalThis.fetch = stubFetch('<p class="da-diff-added">hola</p>');
    const { conf, catalan } = makeConf();
    const connector = makeConnector();

    const { errors } = await checkWaitingLanguages(conf, connector, conf.urls, '/en');

    expect(connector.sendAllLanguages.called).to.be.false;
    expect(catalan.translation.status).to.equal('waiting');
    expect(catalan.waitingFor).to.include({ code: 'es' });
    expect(errors).to.have.length(1);
    expect(errors[0].error).to.equal('Catalan is waiting on Spanish: /page.html has unmerged changes. Please resolve before translating.');
  });

  it('skips a waiting language whose source language is not fully saved', async () => {
    globalThis.fetch = stubFetch('<p>hola</p>');
    const { conf, catalan } = makeConf();
    conf.langs[0].translation.saved = 0;
    const connector = makeConnector();

    const { errors } = await checkWaitingLanguages(conf, connector, conf.urls, '/en');

    expect(errors).to.deep.equal([]);
    expect(connector.sendAllLanguages.called).to.be.false;
    expect(globalThis.fetch.called).to.be.false;
    expect(catalan.translation.status).to.equal('waiting');
  });
});

import { expect } from '@esm-bundle/chai';
import { checkWaitingLanguages } from '../../nx/blocks/loc/views/translate/index.js';
import { clearConfigCache } from '../../nx/blocks/loc/utils/utils.js';

const waitingConf = () => ({
  org: 'org',
  site: 'site',
  options: { 'source.language': { location: '/en' } },
  urls: [{ suppliedPath: '/en/page' }],
  langs: [
    { code: 'fr', name: 'French', location: '/fr', translation: { status: 'complete', saved: 1 } },
    {
      code: 'fr-ca',
      name: 'French (Canada)',
      location: '/fr-ca',
      waitingFor: { code: 'fr', location: '/fr' },
      translation: { status: 'waiting' },
    },
  ],
});

describe('dependent languages', () => {
  let origFetch;

  const respond = (pageStatus) => {
    window.fetch = async (url) => {
      if (url.toString().endsWith('/.da/translate.json')) {
        return new Response(JSON.stringify({ config: { data: [] } }), { status: 200 });
      }
      return new Response('<body><main><div><p>Bonjour</p></div></main></body>', { status: pageStatus });
    };
  };

  const checkWaiting = async (conf) => {
    const sent = [];
    const connector = {
      dnt: { addDnt: async (content) => content },
      sendAllLanguages: async (sendConf) => { sent.push(sendConf); },
    };
    const error = await checkWaitingLanguages(conf, connector, conf.urls, '/en')
      .then(() => undefined, (e) => e);
    return { sent, message: error?.message };
  };

  beforeEach(() => {
    origFetch = window.fetch;
    clearConfigCache();
  });

  afterEach(() => {
    window.fetch = origFetch;
    clearConfigCache();
  });

  it('keeps a dependent language waiting when its page read fails', async () => {
    respond(500);
    const conf = waitingConf();
    const { sent, message } = await checkWaiting(conf);
    expect(sent).to.deep.equal([]);
    expect(message).to.equal('Could not send French (Canada): Error fetching content from /fr/page.html - 500');
    expect(conf.langs[1].waitingFor).to.deep.equal({ code: 'fr', location: '/fr' });
    expect(conf.langs[1].translation.status).to.equal('waiting');
  });

  it('sends a dependent language with its content when the read works', async () => {
    respond(200);
    const conf = waitingConf();
    const { sent, message } = await checkWaiting(conf);
    expect(message).to.be.undefined;
    expect(sent).to.have.length(1);
    expect(sent[0].urls[0].content).to.include('Bonjour');
    expect(conf.langs[1].waitingFor).to.be.undefined;
    expect(conf.langs[1].translation.status).to.equal('not started');
  });
});

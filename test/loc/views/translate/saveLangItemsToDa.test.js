import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { saveLangItemsToDa } from '../../../../nx/blocks/loc/views/translate/index.js';
import { copy } from '../../../../nx/blocks/loc/utils/utils.js';

const OPTIONS = { 'translate.conflict.behavior': 'overwrite' };

function makeLang(code, status) {
  return { code, name: code, translation: { status } };
}

function makeConnector(events) {
  return {
    saveItems: async ({ lang }) => {
      events.push(`save:${lang.code}`);
      return [{ status: 'success' }];
    },
  };
}

function makeConf(langs, events) {
  return {
    org: 'org',
    site: 'site',
    langs,
    urls: [{ suppliedPath: '/a.html', daBasePath: '/a' }],
    langsWithUrls: [],
    sourceLocations: ['/'],
    actions: {
      saveState: async (props, opts) => {
        events.push(`flush:${opts?.waitForSave}`);
      },
    },
  };
}

describe('saveLangItemsToDa', () => {
  it('flushes the project after each saved language', async () => {
    const events = [];
    const langs = [makeLang('de', 'translated'), makeLang('es', 'translated')];
    await saveLangItemsToDa(OPTIONS, makeConf(langs, events), makeConnector(events), () => {});
    expect(events).to.deep.equal(['save:de', 'flush:true', 'save:es', 'flush:true']);
    expect(langs.map((l) => l.translation.status)).to.deep.equal(['complete', 'complete']);
  });

  it('does not save or flush languages that are already complete', async () => {
    const events = [];
    const langs = [makeLang('de', 'complete'), makeLang('es', 'translated')];
    await saveLangItemsToDa(OPTIONS, makeConf(langs, events), makeConnector(events), () => {});
    expect(events).to.deep.equal(['save:es', 'flush:true']);
  });

  it('works without a saveState action', async () => {
    const events = [];
    const langs = [makeLang('de', 'translated')];
    const conf = makeConf(langs, events);
    delete conf.actions;
    await saveLangItemsToDa(OPTIONS, conf, makeConnector(events), () => {});
    expect(events).to.deep.equal(['save:de']);
    expect(langs[0].translation.status).to.equal('complete');
  });
});

describe('saveLangItemsToDa source details', () => {
  afterEach(() => sinon.restore());

  const savedUrl = async (lang) => {
    const overwrite = sinon.stub(copy, 'overwriteCopy').resolves({ ok: true });
    const connector = {
      saveItems: async ({ urls, saveFn }) => {
        for (const url of urls) {
          url.sourceContent = '<body><main></main></body>';
          await saveFn(url);
          url.status = 'success';
        }
        return urls;
      },
    };
    const conf = {
      org: 'org',
      site: 'site',
      langs: [lang],
      urls: [{
        suppliedPath: '/en/a', basePath: '/a', daBasePath: '/a.html', daDestPath: '/en/a.html', ext: 'html',
      }],
      sourceLocations: ['/en'],
    };
    await saveLangItemsToDa(OPTIONS, conf, connector, () => {});
    return overwrite.firstCall.args[0];
  };

  it('names the source page and language on each translated url', async () => {
    const url = await savedUrl({
      code: 'de', name: 'German', location: '/de', translation: { status: 'translated' },
    });
    expect(url.destination).to.equal('/org/site/de/a.html');
    expect(url.sourcePage).to.equal('/org/site/en/a.html');
    expect(url.langName).to.equal('German');
  });

  it('names the custom source page of a language', async () => {
    const url = await savedUrl({
      code: 'de-ch', name: 'Swiss German', location: '/ch/de', source: '/de', translation: { status: 'translated' },
    });
    expect(url.sourcePage).to.equal('/org/site/de/a.html');
    expect(url.langName).to.equal('Swiss German');
  });
});

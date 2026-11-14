import { expect } from '@esm-bundle/chai';
import { saveLangItemsToDa } from '../../../../nx/blocks/loc/views/translate/index.js';

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

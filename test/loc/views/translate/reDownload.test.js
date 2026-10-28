import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { reDownloadLang, saveLangItemsToDa } from '../../../../nx/blocks/loc/views/translate/index.js';

const URLS = [{ basePath: '/a' }, { basePath: '/b' }];
const OPTIONS = { 'translate.conflict.behavior': 'overwrite' };

function makeLang(code, status) {
  return {
    code,
    name: code,
    location: `/${code}`,
    translation: { status, saved: 2 },
  };
}

function makeConf(langs) {
  return {
    org: 'org',
    site: 'site',
    title: 'Project',
    service: {},
    urls: URLS,
    langs,
  };
}

function makeConnector(statuses) {
  return { saveItems: sinon.stub().resolves(statuses.map((status) => ({ status }))) };
}

describe('reDownloadLang', () => {
  it('saves a complete language again', async () => {
    const lang = makeLang('fr', 'complete');
    const connector = makeConnector(['success', 'success']);

    await reDownloadLang({
      options: OPTIONS,
      conf: makeConf([lang]),
      connector,
      lang,
      sendMessage: () => {},
    });

    expect(connector.saveItems.calledOnce).to.be.true;
    expect(lang.translation.status).to.equal('complete');
    expect(lang.translation.saved).to.equal(2);
  });

  it('passes the language index from the full language list', async () => {
    const langs = [makeLang('de', 'complete'), makeLang('fr', 'complete')];
    const connector = makeConnector(['success', 'success']);

    await reDownloadLang({
      options: OPTIONS,
      conf: makeConf(langs),
      connector,
      lang: langs[1],
      sendMessage: () => {},
    });

    const [args] = connector.saveItems.firstCall.args;
    expect(args.langIndex).to.equal(1);
    expect(args.lang).to.equal(langs[1]);
  });

  it('does not save other languages', async () => {
    const langs = [makeLang('de', 'complete'), makeLang('fr', 'complete')];
    const connector = makeConnector(['success', 'success']);

    await reDownloadLang({
      options: OPTIONS,
      conf: makeConf(langs),
      connector,
      lang: langs[0],
      sendMessage: () => {},
    });

    expect(connector.saveItems.calledOnce).to.be.true;
  });

  it('marks the language as error when a page fails to save', async () => {
    const lang = makeLang('fr', 'complete');
    const connector = makeConnector(['success', 'error']);

    await reDownloadLang({
      options: OPTIONS,
      conf: makeConf([lang]),
      connector,
      lang,
      sendMessage: () => {},
    });

    expect(lang.translation.status).to.equal('error');
    expect(lang.translation.saved).to.equal(1);
  });
});

describe('saveLangItemsToDa', () => {
  it('still skips complete languages', async () => {
    const langs = [makeLang('de', 'complete'), makeLang('fr', 'translated')];
    const connector = makeConnector(['success', 'success']);

    await saveLangItemsToDa(OPTIONS, makeConf(langs), connector, () => {});

    expect(connector.saveItems.calledOnce).to.be.true;
    expect(connector.saveItems.firstCall.args[0].lang).to.equal(langs[1]);
    expect(langs[1].translation.status).to.equal('complete');
  });
});

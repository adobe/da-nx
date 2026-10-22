import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { copySourceLangs } from '../../nx/blocks/loc/views/translate/index.js';

const OPTIONS = { 'copy.conflict.behavior': 'overwrite', 'source.language': { location: '/' } };

const makeUrls = (...paths) => paths.map((suppliedPath) => ({
  suppliedPath,
  content: '<p>hello</p>',
}));

const makeFetchStub = (failPattern) => sinon.stub().callsFake(async (url) => {
  const ok = !(failPattern && url.includes(failPattern));
  return {
    ok,
    status: ok ? 200 : 500,
    headers: new Headers({ 'x-da-actions': 'read=true' }),
    text: async () => '',
  };
});

describe('copySourceLangs', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('marks a language complete when every copy succeeds', async () => {
    globalThis.fetch = makeFetchStub();
    const langs = [{ code: 'fr', location: '/fr' }];
    const langsWithUrls = [{ urls: makeUrls('/a', '/b') }];

    await copySourceLangs('org', 'site', 'title', OPTIONS, langs, [], langsWithUrls);

    expect(langs[0].copy).to.deep.equal({ saved: 2, status: 'complete' });
  });

  it('marks a language error when some copies fail', async () => {
    globalThis.fetch = makeFetchStub('/fr/b');
    const langs = [{ code: 'fr', location: '/fr' }];
    const langsWithUrls = [{ urls: makeUrls('/a', '/b') }];

    await copySourceLangs('org', 'site', 'title', OPTIONS, langs, [], langsWithUrls);

    expect(langs[0].copy).to.deep.equal({ saved: 1, status: 'error' });
  });

  it('tracks status per language independently', async () => {
    globalThis.fetch = makeFetchStub('/de/');
    const langs = [{ code: 'fr', location: '/fr' }, { code: 'de', location: '/de' }];
    const langsWithUrls = [{ urls: makeUrls('/a') }, { urls: makeUrls('/a') }];

    await copySourceLangs('org', 'site', 'title', OPTIONS, langs, [], langsWithUrls);

    expect(langs[0].copy.status).to.equal('complete');
    expect(langs[1].copy).to.deep.equal({ saved: 0, status: 'error' });
  });
});

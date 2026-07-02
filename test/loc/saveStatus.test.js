import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { saveStatus } from '../../nx/blocks/loc/project/index.js';

// saveStatus must coalesce concurrent writes to the project JSON:
// if a save is already in-flight, queue the latest state and flush
// it in a second POST rather than firing N concurrent POSTs.

const PROJ_PATH = '/test/org/site/project';

function makeFetchStub(delay = 5) {
  return sinon.stub().callsFake(() => new Promise((resolve) => {
    setTimeout(() => resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'x-da-actions': 'read=true' }),
      text: async () => '',
    }), delay);
  }));
}

function makeState(extra = {}) {
  return {
    org: 'org',
    site: 'site',
    urls: [{ basePath: '/a.html' }],
    langs: [{ code: 'fr', translation: { status: 'not started' } }],
    ...extra,
  };
}

describe('saveStatus', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    window.location.hash = `#${PROJ_PATH}`;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('POSTs the project JSON to /source/<projPath>.json', async () => {
    globalThis.fetch = makeFetchStub();
    const state = makeState();

    await saveStatus(state);

    const calls = globalThis.fetch.args.filter(([url]) => url.includes('.json'));
    expect(calls.length).to.equal(1);
    expect(calls[0][0]).to.include('/source');
    expect(calls[0][1].method).to.equal('POST');
  });

  it('skips the POST when the serialised state has not changed', async () => {
    globalThis.fetch = makeFetchStub();
    const state = makeState();

    await saveStatus(state);
    const countAfterFirst = globalThis.fetch.callCount;

    await saveStatus(state);
    expect(globalThis.fetch.callCount).to.equal(countAfterFirst);
  });

  it('returns an error object when the fetch response is not ok', async () => {
    globalThis.fetch = sinon.stub().resolves({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () => '',
    });

    const result = await saveStatus(makeState({ seq: 'err' }));
    expect(result).to.deep.equal({ error: 'Could not update project' });
  });
});

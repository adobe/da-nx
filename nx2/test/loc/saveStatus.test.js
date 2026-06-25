import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { saveStatus, getDetails } from '../../../nx/blocks/loc/project/index.js';

// saveStatus must dedup writes to the project JSON: an identical serialised
// state must not fire a second POST. A single "Get status" click should
// produce one save, not N concurrent POSTs to the same audit-logged path.

const PROJ_PATH = '/test/org/site/project';

function makeFetchStub({ ok = true, status = 200 } = {}) {
  return sinon.stub().callsFake(() => Promise.resolve({
    ok,
    status,
    headers: new Headers({ 'x-da-actions': 'read=true' }),
    text: async () => '',
    json: async () => ({}),
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

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    window.location.hash = `#${PROJ_PATH}`;
    globalThis.fetch = makeFetchStub();
    // Set the module-private projPath the way the app does.
    await getDetails();
    globalThis.fetch.resetHistory();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('POSTs the project JSON to /source/<projPath>.json', async () => {
    await saveStatus(makeState({ seq: 'post' }));

    const calls = globalThis.fetch.args.filter(([url]) => url.includes('.json'));
    expect(calls.length).to.equal(1);
    expect(calls[0][0]).to.include('/source');
    expect(calls[0][1].method).to.equal('POST');
  });

  it('skips the POST when the serialised state has not changed', async () => {
    const state = makeState({ seq: 'dedup' });

    await saveStatus(state);
    const countAfterFirst = globalThis.fetch.callCount;

    await saveStatus(state);
    expect(globalThis.fetch.callCount).to.equal(countAfterFirst);
  });

  it('returns an error object when the fetch response is not ok', async () => {
    globalThis.fetch = makeFetchStub({ ok: false, status: 500 });

    const result = await saveStatus(makeState({ seq: 'err' }));
    expect(result).to.deep.equal({ error: 'Could not update project' });
  });
});

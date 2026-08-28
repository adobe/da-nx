import { expect } from '@esm-bundle/chai';
import { loadCachedSkills, fetchSkills } from '../../../../../nx2/blocks/chat-ao/utils/skills.js';
import { AO_HTTP_BASE, AO_MANIFEST_ID } from '../../../../../nx2/blocks/chat-ao/ao-constants.js';
import { resetMockIms, setMockIms } from '../../../../../nx2/test/mocks/ims.js';

const cacheKey = (tenantId) => `da-chat-ao-skills--${tenantId}`;
const projectedProductContext = (tenantId) => [{ prodCtx: { owningEntity: tenantId } }];

describe('loadCachedSkills', () => {
  beforeEach(() => {
    resetMockIms();
    setMockIms({ projectedProductContext: projectedProductContext('org1') });
  });

  afterEach(() => {
    localStorage.removeItem(cacheKey('org1'));
    localStorage.removeItem(cacheKey('org2'));
  });

  it('returns null when nothing is cached', async () => {
    expect(await loadCachedSkills()).to.equal(null);
  });

  it('returns the cached list for the active tenant', async () => {
    localStorage.setItem(cacheKey('org1'), JSON.stringify(['writeBlog', 'summarize']));
    expect(await loadCachedSkills()).to.deep.equal(['writeBlog', 'summarize']);
  });

  it('does not return another tenant\'s cached list', async () => {
    localStorage.setItem(cacheKey('org1'), JSON.stringify(['writeBlog']));
    setMockIms({ projectedProductContext: projectedProductContext('org2') });

    expect(await loadCachedSkills()).to.equal(null);
  });

  it('returns null for an empty cached list', async () => {
    localStorage.setItem(cacheKey('org1'), JSON.stringify([]));
    expect(await loadCachedSkills()).to.equal(null);
  });

  it('returns null for malformed JSON rather than throwing', async () => {
    localStorage.setItem(cacheKey('org1'), '{not json');
    expect(await loadCachedSkills()).to.equal(null);
  });
});

describe('fetchSkills', () => {
  let calls;
  let origFetch;

  const installFetch = ({ status: httpStatus = 200, body = '{}' } = {}) => {
    calls = [];
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      calls.push({ url: url.toString(), headers: opts.headers ?? {} });
      return new Response(body, { status: httpStatus });
    };
  };

  const restoreFetch = () => {
    if (origFetch) window.fetch = origFetch;
    origFetch = null;
  };

  const lastCall = () => calls[calls.length - 1];

  beforeEach(() => {
    resetMockIms();
    setMockIms({ projectedProductContext: projectedProductContext('org1') });
    localStorage.removeItem(cacheKey('org1'));
    localStorage.removeItem(cacheKey('org2'));
  });

  afterEach(() => {
    restoreFetch();
    localStorage.removeItem(cacheKey('org1'));
    localStorage.removeItem(cacheKey('org2'));
  });

  it('requests the manifest\'s skill list with an auth header', async () => {
    installFetch({ body: JSON.stringify({ skills: [{ name: 'writeBlog' }] }) });

    await fetchSkills();

    expect(lastCall().url).to.equal(`${AO_HTTP_BASE}/api/v1/skills?manifest_id=${AO_MANIFEST_ID}`);
    expect(lastCall().headers.authorization).to.equal('Bearer test-token');
  });

  it('filters out hidden and non-invocable skills, keeping valid names', async () => {
    installFetch({
      body: JSON.stringify({
        skills: [
          { name: 'writeBlog' },
          { name: 'hiddenSkill', hidden: true },
          { name: 'internalOnly', user_invocable: false },
          { name: 'bad name!' },
          { name: 42 },
        ],
      }),
    });

    expect(await fetchSkills()).to.deep.equal(['writeBlog']);
  });

  it('returns null and does not cache when the filtered list is empty', async () => {
    installFetch({ body: JSON.stringify({ skills: [{ name: 'hiddenSkill', hidden: true }] }) });

    expect(await fetchSkills()).to.equal(null);
    expect(await loadCachedSkills()).to.equal(null);
  });

  it('caches the fetched list for the active tenant', async () => {
    installFetch({ body: JSON.stringify({ skills: [{ name: 'writeBlog' }, { name: 'summarize' }] }) });

    await fetchSkills();

    expect(await loadCachedSkills()).to.deep.equal(['writeBlog', 'summarize']);
    setMockIms({ projectedProductContext: projectedProductContext('org2') });
    expect(await loadCachedSkills()).to.equal(null);
  });

  it('returns null on a non-ok response', async () => {
    installFetch({ status: 500 });

    expect(await fetchSkills()).to.equal(null);
  });

  it('returns null when the fetch itself throws', async () => {
    origFetch = window.fetch;
    window.fetch = async () => { throw new Error('network down'); };

    expect(await fetchSkills()).to.equal(null);
  });
});

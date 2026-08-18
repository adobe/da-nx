import { expect } from '@esm-bundle/chai';
import { loadCachedSkills, fetchSkills } from '../../../../../nx2/blocks/chat-ao/utils/skills.js';
import { AO_HTTP_BASE, AO_MANIFEST_ID } from '../../../../../nx2/blocks/chat-ao/ao-constants.js';

// Dynamic-expression import (not a literal string) so @web/dev-server-import-maps
// does not rewrite this to ...?wds-import-map=0. The same mock URL is reached at
// runtime via the inline importmap when skills.js's static import of ims.js
// resolves, so both this test and skills.js receive the *same* mock module instance.
const imsPath = '../../../../../nx2/utils/ims.js';
const { resetMockIms } = await import(imsPath);

const CACHE_KEY = 'da-chat-ao-skills--experience-workspace';
const BASE = AO_HTTP_BASE.stage;

describe('loadCachedSkills', () => {
  afterEach(() => localStorage.removeItem(CACHE_KEY));

  it('returns null when nothing is cached', () => {
    expect(loadCachedSkills()).to.equal(null);
  });

  it('returns the cached list when present', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(['writeBlog', 'summarize']));
    expect(loadCachedSkills()).to.deep.equal(['writeBlog', 'summarize']);
  });

  it('returns null for an empty cached list', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify([]));
    expect(loadCachedSkills()).to.equal(null);
  });

  it('returns null for malformed JSON rather than throwing', () => {
    localStorage.setItem(CACHE_KEY, '{not json');
    expect(() => loadCachedSkills()).to.not.throw();
    expect(loadCachedSkills()).to.equal(null);
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
    localStorage.removeItem(CACHE_KEY);
  });

  afterEach(() => {
    restoreFetch();
    localStorage.removeItem(CACHE_KEY);
  });

  it('requests the manifest\'s skill list with an auth header', async () => {
    installFetch({ body: JSON.stringify({ skills: [{ name: 'writeBlog' }] }) });

    await fetchSkills();

    expect(lastCall().url).to.equal(`${BASE}/api/v1/skills?manifest_id=${AO_MANIFEST_ID}`);
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
    expect(loadCachedSkills()).to.equal(null);
  });

  it('caches the fetched list for loadCachedSkills to pick up', async () => {
    installFetch({ body: JSON.stringify({ skills: [{ name: 'writeBlog' }, { name: 'summarize' }] }) });

    await fetchSkills();

    expect(loadCachedSkills()).to.deep.equal(['writeBlog', 'summarize']);
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

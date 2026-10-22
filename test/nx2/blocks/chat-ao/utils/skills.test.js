import { expect } from '@esm-bundle/chai';
import {
  loadCachedSkills, fetchSkills, truncateDescription, toSlashMenuItems,
} from '../../../../../nx2/blocks/chat-ao/utils/skills.js';
import { AO_HTTP_BASE, AO_MANIFEST_ID } from '../../../../../nx2/blocks/chat-ao/ao-constants.js';
import { resetMockIms, setMockIms } from '../../../../../nx2/test/mocks/ims.js';

const cacheKey = (tenantId) => `da-chat-ao-skills--${tenantId}`;
// fetchSkills() -> resolveManifestId() also caches per tenant+user; clear it too.
const resolvedManifestCacheKey = (tenantId, userId) => `da-chat-ao-resolved-manifest--${tenantId}--${userId}`;
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

  it('returns the cached list for the active tenant, sorted by name', async () => {
    localStorage.setItem(cacheKey('org1'), JSON.stringify([
      { name: 'writeBlog', description: 'Write a blog post' },
      { name: 'summarize', description: 'Summarize a page' },
    ]));
    expect(await loadCachedSkills()).to.deep.equal([
      { name: 'summarize', description: 'Summarize a page' },
      { name: 'writeBlog', description: 'Write a blog post' },
    ]);
  });

  it('upgrades a legacy cache of plain skill names', async () => {
    localStorage.setItem(cacheKey('org1'), JSON.stringify(['writeBlog', 'summarize']));
    expect(await loadCachedSkills()).to.deep.equal([
      { name: 'summarize', description: '' },
      { name: 'writeBlog', description: '' },
    ]);
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

  const defaultUserId = 'test-user@AdobeID'; // resetMockIms()'s own default

  beforeEach(() => {
    resetMockIms();
    setMockIms({ projectedProductContext: projectedProductContext('org1') });
    localStorage.removeItem(cacheKey('org1'));
    localStorage.removeItem(cacheKey('org2'));
    sessionStorage.removeItem(resolvedManifestCacheKey('org1', defaultUserId));
    sessionStorage.removeItem(resolvedManifestCacheKey('org2', defaultUserId));
  });

  afterEach(() => {
    restoreFetch();
    localStorage.removeItem(cacheKey('org1'));
    localStorage.removeItem(cacheKey('org2'));
    sessionStorage.removeItem(resolvedManifestCacheKey('org1', defaultUserId));
    sessionStorage.removeItem(resolvedManifestCacheKey('org2', defaultUserId));
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

    expect(await fetchSkills()).to.deep.equal([{ name: 'writeBlog', description: '' }]);
  });

  it('returns skills sorted alphabetically (case-insensitive) with their descriptions', async () => {
    installFetch({
      body: JSON.stringify({
        skills: [
          { name: 'writeBlog', description: '  Write a blog post ' },
          { name: 'Audit', description: 'Audit a page' },
          { name: 'summarize', description: 42 },
        ],
      }),
    });

    expect(await fetchSkills()).to.deep.equal([
      { name: 'Audit', description: 'Audit a page' },
      { name: 'summarize', description: '' },
      { name: 'writeBlog', description: 'Write a blog post' },
    ]);
  });

  it('returns null and does not cache when the filtered list is empty', async () => {
    installFetch({ body: JSON.stringify({ skills: [{ name: 'hiddenSkill', hidden: true }] }) });

    expect(await fetchSkills()).to.equal(null);
    expect(await loadCachedSkills()).to.equal(null);
  });

  it('caches the fetched list for the active tenant', async () => {
    installFetch({
      body: JSON.stringify({
        skills: [{ name: 'writeBlog', description: 'Write' }, { name: 'summarize', description: 'Sum' }],
      }),
    });

    await fetchSkills();

    expect(await loadCachedSkills()).to.deep.equal([
      { name: 'summarize', description: 'Sum' },
      { name: 'writeBlog', description: 'Write' },
    ]);
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

describe('truncateDescription', () => {
  it('leaves descriptions of 50 characters or fewer untouched', () => {
    const fifty = 'a'.repeat(50);
    expect(truncateDescription(fifty)).to.equal(fifty);
    expect(truncateDescription('Short')).to.equal('Short');
  });

  it('cuts longer descriptions at 50 characters and appends an ellipsis', () => {
    expect(truncateDescription('b'.repeat(80))).to.equal(`${'b'.repeat(50)}...`);
  });

  it('drops trailing whitespace before the ellipsis', () => {
    const text = `${'c'.repeat(48)}  and then much more text`;
    expect(truncateDescription(text)).to.equal(`${'c'.repeat(48)}...`);
  });

  it('returns an empty string for missing descriptions', () => {
    expect(truncateDescription()).to.equal('');
    expect(truncateDescription('')).to.equal('');
  });
});

describe('toSlashMenuItems', () => {
  const skills = [
    { name: 'account-research', description: 'Deep company and account research' },
    { name: 'aem-governance-evaluate-page', description: `Check a web page against brand rules ${'x'.repeat(40)}` },
    { name: 'summarize', description: '' },
  ];

  it('renders a section header followed by slash-prefixed skills with truncated descriptions', () => {
    expect(toSlashMenuItems({ skills })).to.deep.equal([
      { section: 'Skills' },
      { id: 'account-research', label: '/account-research', description: 'Deep company and account research' },
      {
        id: 'aem-governance-evaluate-page',
        label: '/aem-governance-evaluate-page',
        description: truncateDescription(skills[1].description),
      },
      { id: 'summarize', label: '/summarize', description: '' },
    ]);
  });

  it('filters by skill name, case-insensitively', () => {
    const items = toSlashMenuItems({ skills, filter: 'aem' });
    expect(items.map((i) => i.id ?? i.section)).to.deep.equal(['Skills', 'aem-governance-evaluate-page']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(toSlashMenuItems({ skills, filter: 'nope' })).to.deep.equal([]);
    expect(toSlashMenuItems({ skills: [] })).to.deep.equal([]);
  });
});

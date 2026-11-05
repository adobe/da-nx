import { expect } from '@esm-bundle/chai';
import { useAoChat, loadChat } from '../../../nx2/utils/chat.js';
import { resetMockIms, setMockIms } from '../../../nx2/test/mocks/ims.js';
import { REQUIRED_SERVICE_CODES } from '../../../nx2/utils/entitlement.js';

// isHlx6's upgrade probe reads resp.headers.get(...) before daConfig ever reads
// the body, so every mocked fetch here needs a real headers.get, not just json().
// loadChat() also imports the chat block, whose loadStyle() reads resp.text() —
// without it that promise never settles and the loadChat tests time out.
function mockFetch(json) {
  return async () => ({
    ok: true,
    headers: { get: () => null },
    json: async () => json,
    text: async () => '',
  });
}

function withUrl(hash, search, fn) {
  const originalHash = window.location.hash;
  const originalSearch = window.location.search;
  history.pushState(null, '', `${window.location.pathname}${search}${hash}`);
  try {
    return fn();
  } finally {
    history.pushState(null, '', `${window.location.pathname}${originalSearch}${originalHash}`);
  }
}

describe('useAoChat', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('forces AO via ?nx-chat-ao=true regardless of org/site or the flag', async () => {
    await withUrl('', '?nx-chat-ao=true', async () => {
      expect(await useAoChat()).to.equal(true);
    });
  });

  it('does not force AO for any other query value — falls through to the flag check', async () => {
    window.fetch = mockFetch({ flags: { data: [] } });
    await withUrl('', '?nx-chat-ao=reset', async () => {
      expect(await useAoChat()).to.equal(false);
    });
  });

  it('returns false without checking the flag when there is no org/site in the hash', async () => {
    let fetchCalled = false;
    window.fetch = async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) };
    };
    await withUrl('', '', async () => {
      expect(await useAoChat()).to.equal(false);
    });
    expect(fetchCalled).to.equal(false);
  });

  it('resolves true when the org/site has ew.coworker=true', async () => {
    window.fetch = mockFetch({ flags: { data: [{ key: 'ew.coworker', value: 'true' }] } });
    await withUrl('#/chat-org1/chat-site1', '', async () => {
      expect(await useAoChat()).to.equal(true);
    });
  });

  it('resolves false when the org/site has no ew.coworker flag', async () => {
    window.fetch = mockFetch({ flags: { data: [] } });
    await withUrl('#/chat-org2/chat-site2', '', async () => {
      expect(await useAoChat()).to.equal(false);
    });
  });
});

describe('loadChat — ew.coworker=cma harness selection', () => {
  let savedFetch;
  beforeEach(() => {
    savedFetch = window.fetch;
    resetMockIms();
  });
  afterEach(() => {
    window.fetch = savedFetch;
    resetMockIms();
  });

  it('selects the CMA harness when ew.coworker=cma AND the user is entitled', async () => {
    setMockIms({
      projectedProductContext: [{ prodCtx: { owningEntity: 'org-1', serviceCode: REQUIRED_SERVICE_CODES[0] } }],
    });
    window.fetch = mockFetch({ flags: { data: [{ key: 'ew.coworker', value: 'cma' }] } });
    await withUrl('#/cma-org1/cma-site1', '', async () => {
      const chat = await loadChat();
      expect(chat.tagName.toLowerCase()).to.equal('nx-chat-ao');
    });
  });

  it('forwards an explicit context to resolveAoChatConfig instead of reading the hash '
    + '(regression: loadChat({ context }) must not silently ignore it - PR #948 review)', async () => {
    setMockIms({
      projectedProductContext: [{ prodCtx: { owningEntity: 'org-1', serviceCode: REQUIRED_SERVICE_CODES[0] } }],
    });
    window.fetch = mockFetch({ flags: { data: [{ key: 'ew.coworker', value: 'cma' }] } });
    // Deliberately no matching hash (or none at all) - if loadChat dropped the
    // context argument, resolveAoChatConfig would fall back to the empty hash
    // state and return the legacy chat instead of nx-chat-ao.
    await withUrl('', '', async () => {
      const chat = await loadChat({ context: { org: 'cma-org1', site: 'cma-site1' } });
      expect(chat.tagName.toLowerCase()).to.equal('nx-chat-ao');
    });
  });

  it('falls back to legacy when ew.coworker=cma but the user is NOT entitled', async () => {
    window.fetch = mockFetch({ flags: { data: [{ key: 'ew.coworker', value: 'cma' }] } });
    await withUrl('#/cma-org2/cma-site2', '', async () => {
      const chat = await loadChat();
      // not entitled => cma downgrades to legacy, no Coworker fallback
      expect(chat.tagName.toLowerCase()).to.equal('nx-chat');
    });
  });

  it('selects Coworker for ew.coworker=true regardless of entitlement', async () => {
    setMockIms({
      projectedProductContext: [{ prodCtx: { owningEntity: 'org-1', serviceCode: REQUIRED_SERVICE_CODES[0] } }],
    });
    window.fetch = mockFetch({ flags: { data: [{ key: 'ew.coworker', value: 'true' }] } });
    await withUrl('#/cma-org3/cma-site3', '', async () => {
      const chat = await loadChat();
      expect(chat.tagName.toLowerCase()).to.equal('nx-chat-ao');
    });
  });
});

// The harness resolution table for the single `ew.coworker` flag. One setting,
// no contradictory state: 'cma' upgrades to CMA when entitled and falls back
// to legacy otherwise, 'true' is Coworker, unset is legacy.
describe('loadChat — harness resolution table', () => {
  let savedFetch;
  beforeEach(() => {
    savedFetch = window.fetch;
    resetMockIms();
  });
  afterEach(() => {
    window.fetch = savedFetch;
    resetMockIms();
  });

  const entitledCtx = {
    projectedProductContext: [
      { prodCtx: { owningEntity: 'org-1', serviceCode: REQUIRED_SERVICE_CODES[0] } },
    ],
  };

  const rows = [
    { name: 'ew.coworker unset -> legacy', value: null, entitled: false, tag: 'nx-chat' },
    { name: 'ew.coworker=true -> Coworker (AO)', value: 'true', entitled: false, tag: 'nx-chat-ao' },
    { name: 'ew.coworker=cma, entitled -> CMA (AO)', value: 'cma', entitled: true, tag: 'nx-chat-ao' },
    { name: 'ew.coworker=cma, NOT entitled -> legacy', value: 'cma', entitled: false, tag: 'nx-chat' },
  ];

  rows.forEach((row, i) => {
    it(`${row.name}`, async () => {
      if (row.entitled) setMockIms(entitledCtx);
      const data = row.value ? [{ key: 'ew.coworker', value: row.value }] : [];
      window.fetch = mockFetch({ flags: { data } });
      await withUrl(`#/table-org${i}/table-site${i}`, '', async () => {
        const chat = await loadChat();
        expect(chat.tagName.toLowerCase()).to.equal(row.tag);
      });
    });
  });
});

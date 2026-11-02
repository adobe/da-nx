import { expect } from '@esm-bundle/chai';
import { useAoChat, loadChat } from '../../../nx2/utils/chat.js';
import { resetMockIms, setMockIms } from '../../../nx2/test/mocks/ims.js';
import { REQUIRED_SERVICE_CODES } from '../../../nx2/utils/entitlement.js';

// isHlx6's upgrade probe reads resp.headers.get(...) before daConfig ever reads
// the body, so every mocked fetch here needs a real headers.get, not just json().
function mockFetch(json) {
  return async () => ({ ok: true, headers: { get: () => null }, json: async () => json });
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

describe('loadChat — ew.cma harness selection', () => {
  let savedFetch;
  beforeEach(() => {
    savedFetch = window.fetch;
    resetMockIms();
  });
  afterEach(() => {
    window.fetch = savedFetch;
    resetMockIms();
  });

  it('selects the CMA harness only when both ew.cma AND entitlement hold', async () => {
    setMockIms({
      projectedProductContext: [{ prodCtx: { owningEntity: 'org-1', serviceCode: REQUIRED_SERVICE_CODES[0] } }],
    });
    window.fetch = mockFetch({ flags: { data: [{ key: 'ew.cma', value: 'true' }] } });
    await withUrl('#/cma-org1/cma-site1', '', async () => {
      const chat = await loadChat();
      expect(chat.tagName.toLowerCase()).to.equal('nx-chat-ao');
    });
  });

  it('does NOT select CMA when the flag is on but the org is not entitled', async () => {
    window.fetch = mockFetch({ flags: { data: [{ key: 'ew.cma', value: 'true' }] } });
    await withUrl('#/cma-org2/cma-site2', '', async () => {
      const chat = await loadChat();
      // not entitled + no ew.coworker => useAoChat is false => legacy nx-chat
      expect(chat.tagName.toLowerCase()).to.equal('nx-chat');
    });
  });

  it('does NOT select CMA when entitled but the ew.cma flag is off', async () => {
    setMockIms({
      projectedProductContext: [{ prodCtx: { owningEntity: 'org-1', serviceCode: REQUIRED_SERVICE_CODES[0] } }],
    });
    window.fetch = mockFetch({ flags: { data: [] } });
    await withUrl('#/cma-org3/cma-site3', '', async () => {
      const chat = await loadChat();
      expect(chat.tagName.toLowerCase()).to.equal('nx-chat');
    });
  });
});

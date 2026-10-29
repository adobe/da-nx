import { expect } from '@esm-bundle/chai';
import { useAoChat, loadChatInput } from '../../../nx2/utils/chat.js';

await import('../../../nx2/blocks/chat-ao/input.js');

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

  it('does not create an AO input for the legacy backend', async () => {
    await withUrl('', '', async () => {
      expect(await loadChatInput()).to.equal(undefined);
    });
  });

  it('creates only the input with the configured CMA appearance, without a conversation', async () => {
    window.fetch = mockFetch({
      flags: {
        data: [
          { key: 'ew.coworker', value: 'true' },
          { key: 'ew.altHarness', value: 'test-activation' },
        ],
      },
    });
    await withUrl('#/input-org/input-site', '', async () => {
      const input = await loadChatInput();
      expect(input.localName).to.equal('nx-ao-input');
      expect(input.altHarness).to.equal(true);
      expect(input.isConnected).to.equal(false);
      expect(input._controller).to.equal(undefined);
    });
  });
});

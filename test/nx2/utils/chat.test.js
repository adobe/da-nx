import { expect } from '@esm-bundle/chai';
import { useAoChat } from '../../../nx2/utils/chat.js';

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
    window.fetch = async () => ({ ok: true, json: async () => ({ flags: { data: [] } }) });
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
    window.fetch = async () => ({
      ok: true,
      json: async () => ({ flags: { data: [{ key: 'ew.coworker', value: 'true' }] } }),
    });
    await withUrl('#/chat-org1/chat-site1', '', async () => {
      expect(await useAoChat()).to.equal(true);
    });
  });

  it('resolves false when the org/site has no ew.coworker flag', async () => {
    window.fetch = async () => ({ ok: true, json: async () => ({ flags: { data: [] } }) });
    await withUrl('#/chat-org2/chat-site2', '', async () => {
      expect(await useAoChat()).to.equal(false);
    });
  });
});

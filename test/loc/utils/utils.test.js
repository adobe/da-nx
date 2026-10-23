import sinon from 'sinon';
import { expect } from '@esm-bundle/chai';
import { fetchConfig } from '../../../nx/blocks/loc/utils/utils.js';

const mockConfig = (value) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

describe('fetchConfig', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('refreshes the cached configuration when requested', async () => {
    const fetchStub = sinon.stub(window, 'fetch');
    const cachedConfig = { value: 'cached' };
    const refreshedConfig = { value: 'refreshed' };

    fetchStub.onFirstCall().resolves(mockConfig(cachedConfig));
    fetchStub.onSecondCall().resolves(mockConfig(refreshedConfig));

    expect(await fetchConfig('org', 'site')).to.deep.equal(cachedConfig);
    expect(await fetchConfig('org', 'site', { refresh: true })).to.deep.equal(refreshedConfig);
    expect(fetchStub.callCount).to.equal(2);
  });
});

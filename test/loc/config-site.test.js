import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { fetchConfig } from '../../nx/blocks/loc/utils/utils.js';

describe('Loc configuration site isolation', () => {
  afterEach(() => sinon.restore());

  it('does not reuse the first site configuration for a different destination', async () => {
    const fetch = sinon.stub(window, 'fetch').callsFake(async (href) => new Response(JSON.stringify({
      config: { data: [{ key: 'source.fragment.hostnames', value: href }] },
    })));
    const first = await fetchConfig('copy-config-test', 'first');
    const second = await fetchConfig('copy-config-test', 'second');
    expect(first).not.to.deep.equal(second);
    expect(await fetchConfig('copy-config-test', 'first')).to.equal(first);
    expect(fetch.callCount).to.equal(2);
  });
});

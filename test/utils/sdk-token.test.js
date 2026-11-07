import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

const HREF = 'https://admin.da.live/source/org/site/page.html';
const MINUTE = 60 * 1000;

describe('SDK token refresh', () => {
  let channel;
  let actions;
  let fetchStub;
  const requests = [];

  before(async () => {
    const { default: sdk } = await import('../../nx/utils/sdk.js');
    channel = new MessageChannel();
    channel.port1.onmessage = ({ data }) => {
      if (data.action !== 'getToken') return;
      requests.push(data);
      channel.port1.postMessage({
        action: 'sdkResponse',
        requestId: data.requestId,
        result: { ok: true, token: 'fresh-token', tokenExpire: Date.now() + 60 * MINUTE },
      });
    };
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        ready: true,
        token: 'initial-token',
        tokenExpire: Date.now() + MINUTE,
        capabilities: { tokenRefresh: 1 },
      },
      ports: [channel.port2],
    }));
    ({ actions } = await sdk);
  });

  beforeEach(() => {
    fetchStub = sinon.stub(window, 'fetch').resolves(new Response('', { status: 200 }));
  });

  afterEach(() => sinon.restore());

  after(() => {
    channel.port1.close();
    channel.port2.close();
  });

  it('asks the host for a fresh token before an expiring token is used', async () => {
    await actions.daFetch(HREF);
    expect(requests.length).to.equal(1);
    expect(fetchStub.firstCall.args[1].headers.Authorization).to.equal('Bearer fresh-token');
  });

  it('keeps using the refreshed token until it nears expiry', async () => {
    await actions.daFetch(HREF);
    expect(requests.length).to.equal(1);
    expect(fetchStub.firstCall.args[1].headers.Authorization).to.equal('Bearer fresh-token');
  });

  it('exposes the current token and expiry through getToken', async () => {
    const { token, tokenExpire } = await actions.getToken();
    expect(token).to.equal('fresh-token');
    expect(tokenExpire).to.be.greaterThan(Date.now() + 59 * MINUTE);
    expect(requests.length).to.equal(1);
  });
});

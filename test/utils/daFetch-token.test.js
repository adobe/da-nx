import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { daFetch, setImsDetails, setTokenRefresh } from '../../nx/utils/daFetch.js';

const HREF = 'https://admin.da.live/source/org/site/page.html';
const MINUTE = 60 * 1000;

describe('daFetch with a host-provided token', () => {
  let fetchStub;

  const authHeader = (call = 0) => fetchStub.getCall(call).args[1].headers.Authorization;

  beforeEach(() => {
    fetchStub = sinon.stub(window, 'fetch').resolves(new Response('', { status: 200 }));
  });

  afterEach(() => {
    setTokenRefresh(undefined);
    sinon.restore();
  });

  it('returns a 401 instead of loading IMS inside the app', async () => {
    fetchStub.resolves(new Response('', { status: 401 }));
    setImsDetails('old-token');
    const resp = await daFetch(HREF);
    expect(resp.status).to.equal(401);
  });

  it('uses the current token when it is not close to expiry', async () => {
    const refresh = sinon.stub();
    setTokenRefresh(refresh);
    setImsDetails('current-token', { expire: Date.now() + 60 * MINUTE });
    await daFetch(HREF);
    expect(refresh.called).to.equal(false);
    expect(authHeader()).to.equal('Bearer current-token');
  });

  it('refreshes a token that is about to expire before sending the request', async () => {
    const expire = Date.now() + 60 * MINUTE;
    const refresh = sinon.stub().resolves({ ok: true, token: 'new-token', expire });
    setTokenRefresh(refresh);
    setImsDetails('old-token', { expire: Date.now() + MINUTE });
    await daFetch(HREF);
    await daFetch(HREF);
    expect(refresh.calledOnce).to.equal(true);
    expect(authHeader(0)).to.equal('Bearer new-token');
    expect(authHeader(1)).to.equal('Bearer new-token');
  });

  it('shares one refresh between concurrent requests', async () => {
    const refresh = sinon.stub().resolves({ ok: true, token: 'new-token', expire: Date.now() + 60 * MINUTE });
    setTokenRefresh(refresh);
    setImsDetails('old-token', { expire: Date.now() - MINUTE });
    await Promise.all([daFetch(HREF), daFetch(HREF)]);
    expect(refresh.calledOnce).to.equal(true);
    expect(authHeader(0)).to.equal('Bearer new-token');
    expect(authHeader(1)).to.equal('Bearer new-token');
  });

  it('keeps the existing token when the host cannot refresh it', async () => {
    setTokenRefresh(sinon.stub().resolves({ ok: false, error: 'timeout' }));
    setImsDetails('old-token', { expire: Date.now() + MINUTE });
    await daFetch(HREF);
    expect(authHeader()).to.equal('Bearer old-token');
  });

  it('does not refresh without a host refresh handler', async () => {
    setImsDetails('old-token', { expire: Date.now() + MINUTE });
    await daFetch(HREF);
    expect(authHeader()).to.equal('Bearer old-token');
  });
});

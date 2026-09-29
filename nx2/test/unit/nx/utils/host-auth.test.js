import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

// This suite tests the real `host-auth.js` implementation, not the mock in
// `nx2/test/mocks/host-auth.js` (which other suites, e.g. `daFetch`'s tests,
// use via the import map in wtr.config.mjs). A query string on the specifier
// isn't matched by that import map's exact-string entries, so it both (a)
// bypasses the mock substitution and (b) gives every test its own fresh
// module instance — required since host-auth.js's handshake state is
// deliberately not reset-able in production code.
let fresh = 0;
async function importHostAuth() {
  fresh += 1;
  return import(`/nx2/utils/host-auth.js?fresh=${fresh}`);
}

// Simulates a host (e.g. da.live's app shell) completing the handshake with
// an embedded page, exactly as nx/blocks/shell/shell.js does: a message
// carrying `ready: true` plus a transferred MessageChannel port.
function dispatchHandshake({ token, context } = {}) {
  const channel = new MessageChannel();
  window.postMessage({ ready: true, token, context }, '*', [channel.port2]);
  return channel.port1;
}

function wait(ms = 50) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

describe('host-auth', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('adopts host context and token from a valid handshake message', async () => {
    const { initHostAuth, getHostContext, getAccessToken } = await importHostAuth();

    dispatchHandshake({ token: 'abc-token', context: { org: 'adobe', repo: 'da-nx' } });

    const result = await initHostAuth();
    expect(result).to.deep.equal({ isEmbedded: true });
    expect(await getAccessToken()).to.deep.equal({ token: 'abc-token' });
    expect(await getHostContext()).to.deep.equal({ org: 'adobe', repo: 'da-nx' });
  });

  it('resolves as standalone when no handshake message arrives, and setHash is then a no-op', async function test() {
    this.timeout(4000);
    const { initHostAuth, getAccessToken, setHash } = await importHostAuth();

    const result = await initHostAuth();
    expect(result).to.deep.equal({ isEmbedded: false });
    expect(await getAccessToken()).to.equal(undefined);
    // Nothing to post to — must resolve without throwing.
    await setHash('#/foo');
  });

  it('only performs a single handshake when called concurrently from multiple entry points', async () => {
    const { initHostAuth, getAccessToken, getHostContext } = await importHostAuth();
    const addEventListenerSpy = sandbox.spy(window, 'addEventListener');

    const calls = [initHostAuth(), getAccessToken(), getHostContext()];
    dispatchHandshake({ token: 'memo-token' });
    await Promise.all(calls);

    const messageListenerCalls = addEventListenerSpy.getCalls()
      .filter((call) => call.args[0] === 'message');
    expect(messageListenerCalls).to.have.lengthOf(1);
    expect(await getAccessToken()).to.deep.equal({ token: 'memo-token' });
  });

  it('ignores an unrelated message event that is not a handshake', async () => {
    const { initHostAuth, getAccessToken } = await importHostAuth();

    window.postMessage({ foo: 'bar' }, '*');
    await wait();
    dispatchHandshake({ token: 'real-token' });

    const result = await initHostAuth();
    expect(result).to.deep.equal({ isEmbedded: true });
    expect(await getAccessToken()).to.deep.equal({ token: 'real-token' });
  });

  it('adopts only the first of two racing handshake messages and ignores the second', async () => {
    const { initHostAuth, getAccessToken } = await importHostAuth();

    dispatchHandshake({ token: 'first-token' });
    dispatchHandshake({ token: 'second-token' });
    await initHostAuth();
    await wait();

    expect(await getAccessToken()).to.deep.equal({ token: 'first-token' });
  });

  it('applies a token update sent over the adopted port in place, without re-resolving the handshake promise', async () => {
    const { initHostAuth, getAccessToken } = await importHostAuth();
    const hostPort = dispatchHandshake({ token: 'initial-token' });

    const firstHandshakePromise = initHostAuth();
    await firstHandshakePromise;
    expect(await getAccessToken()).to.deep.equal({ token: 'initial-token' });

    hostPort.postMessage({ token: 'refreshed-token' });
    await wait();

    expect(await getAccessToken()).to.deep.equal({ token: 'refreshed-token' });
    // Same promise instance — a refresh updates state in place, it does not
    // trigger (or return) a new handshake.
    expect(initHostAuth()).to.equal(firstHandshakePromise);
  });

  it('posts a setHash action on the adopted port when embedded', async () => {
    const { initHostAuth, setHash } = await importHostAuth();
    const hostPort = dispatchHandshake({ token: 'x' });
    const onMessage = sandbox.spy();
    hostPort.onmessage = onMessage;

    await initHostAuth();
    await setHash('#/some/path');
    await wait();

    expect(onMessage.calledOnce).to.equal(true);
    expect(onMessage.firstCall.args[0].data).to.deep.equal({
      action: 'setHash',
      details: '#/some/path',
    });
  });
});

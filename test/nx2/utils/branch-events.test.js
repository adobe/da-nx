import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { BRANCH_EVENT, requestCanvasBranch } from '../../../nx2/utils/branch-events.js';

describe('canvas branch contract', () => {
  const path = '/Org/Site/Some/Page';
  const report = (detail) => document.dispatchEvent(new CustomEvent(BRANCH_EVENT.STATE, {
    detail,
  }));
  let onRequest;
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    document.removeEventListener(BRANCH_EVENT.REQUEST, onRequest);
    sinon.restore();
  });

  it('registers before requesting and preserves the context path', async () => {
    onRequest = (event) => {
      expect(event.detail).to.deep.equal({ path });
      report({ path, status: 'ready', branch: 'Feat/My_Branch' });
    };
    document.addEventListener(BRANCH_EVENT.REQUEST, onRequest);
    expect(await requestCanvasBranch({ path })).to.equal('Feat/My_Branch');
    expect(clock.countTimers()).to.equal(0);
  });

  it('retries until a late bridge can replay state', async () => {
    const pending = requestCanvasBranch({ path });
    await clock.tickAsync(200);
    onRequest = () => report({ path, status: 'ready', branch: 'main' });
    document.addEventListener(BRANCH_EVENT.REQUEST, onRequest);
    await clock.tickAsync(100);
    expect(await pending).to.equal('main');
    expect(clock.countTimers()).to.equal(0);
  });

  it('uses an observed legacy branch when the host has no bridge', async () => {
    const getLegacyBranch = sinon.stub().returns('legacy-feature');
    const pending = requestCanvasBranch({ path, getLegacyBranch });
    await clock.tickAsync(100);
    expect(await pending).to.equal('legacy-feature');
    expect(clock.countTimers()).to.equal(0);
  });

  it('never replaces known pending bridge state with legacy iframe state', async () => {
    const getLegacyBranch = sinon.stub().returns('stale-iframe');
    const pending = requestCanvasBranch({ path, getLegacyBranch });
    report({ path, status: 'pending' });
    await clock.tickAsync(200);
    expect(getLegacyBranch.called).to.be.false;
    report({ path, status: 'ready', branch: 'resolved' });
    expect(await pending).to.equal('resolved');
  });

  it('does not use a legacy fallback after an explicit bridge error', async () => {
    const getLegacyBranch = sinon.stub().returns('stale-iframe');
    const pending = requestCanvasBranch({ path, getLegacyBranch }).catch((error) => error);
    report({ path, status: 'error', error: 'Invalid config' });
    expect((await pending).message).to.equal('Invalid config');
    await clock.tickAsync(200);
    expect(getLegacyBranch.called).to.be.false;
  });

  it('ignores other documents, pending state, and malformed ready state', async () => {
    let resolved = false;
    const pending = requestCanvasBranch({ path }).then((branch) => {
      resolved = true;
      return branch;
    });
    report({ path: '/other/site/page', status: 'ready', branch: 'wrong' });
    report({ path, status: 'pending' });
    report({ path, status: 'ready', branch: '' });
    await clock.tickAsync(100);
    expect(resolved).to.be.false;
    report({ path, status: 'ready', branch: 'correct' });
    expect(await pending).to.equal('correct');
  });

  it('rejects error state without falling back to main', async () => {
    const pending = requestCanvasBranch({ path }).catch((error) => error);
    report({ path, status: 'error', error: 'Config unavailable' });
    expect((await pending).message).to.equal('Config unavailable');
    expect(clock.countTimers()).to.equal(0);
  });

  it('times out and removes its listener and polling timers', async () => {
    const remove = sinon.spy(document, 'removeEventListener');
    const pending = requestCanvasBranch({ path }).catch((error) => error);
    await clock.tickAsync(3000);
    expect((await pending).message).to.equal('Canvas branch unavailable.');
    expect(remove.calledWith(BRANCH_EVENT.STATE)).to.be.true;
    expect(clock.countTimers()).to.equal(0);
  });

  it('cancels superseded requests and releases listeners', async () => {
    const controller = new AbortController();
    const pending = requestCanvasBranch({ path, signal: controller.signal })
      .catch((error) => error);
    controller.abort();
    expect((await pending).name).to.equal('AbortError');
    expect(clock.countTimers()).to.equal(0);
  });

  it('does not request state with an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    onRequest = sinon.spy();
    document.addEventListener(BRANCH_EVENT.REQUEST, onRequest);
    const error = await requestCanvasBranch({ path, signal: controller.signal }).catch((e) => e);
    expect(error.name).to.equal('AbortError');
    expect(onRequest.called).to.be.false;
    expect(clock.countTimers()).to.equal(0);
  });
});

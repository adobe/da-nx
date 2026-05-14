import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { showToast } from '../../../../../../blocks/shared/toast/toast.js';

const HOST_ID = 'nx-toast-host';

function cleanup() {
  document.querySelectorAll('nx-toast').forEach((el) => el.remove());
  document.getElementById(HOST_ID)?.remove();
}

afterEach(cleanup);

// ─── showToast no-op ─────────────────────────────────────────────────────────

describe('showToast', () => {
  it('does nothing for empty text', () => {
    showToast({ text: '' });
    expect(document.querySelector('nx-toast')).to.be.null;
  });

  it('does nothing for whitespace-only text', () => {
    showToast({ text: '   ' });
    expect(document.querySelector('nx-toast')).to.be.null;
  });
});

// ─── Timeout floor ───────────────────────────────────────────────────────────

describe('NxToast timeout', () => {
  let timeoutStub;

  beforeEach(() => {
    timeoutStub = sinon.stub(window, 'setTimeout').returns(1);
  });

  afterEach(() => timeoutStub.restore());

  it('clamps timeout below 6000ms to 6000ms', () => {
    showToast({ text: 'hello', timeout: 100 });
    expect(timeoutStub.calledOnce).to.be.true;
    expect(timeoutStub.firstCall.args[1]).to.equal(6000);
  });

  it('respects timeout values above 6000ms', () => {
    showToast({ text: 'hello', timeout: 8000 });
    expect(timeoutStub.calledOnce).to.be.true;
    expect(timeoutStub.firstCall.args[1]).to.equal(8000);
  });
});

// ─── dismiss ─────────────────────────────────────────────────────────────────

describe('NxToast dismiss', () => {
  it('removes the element and cancels the pending timer', () => {
    showToast({ text: 'hello' });
    const toast = document.querySelector('nx-toast');
    expect(toast._timerId).to.not.be.undefined;
    toast.dismiss();
    expect(document.querySelector('nx-toast')).to.be.null;
    expect(toast._timerId).to.be.undefined;
  });
});

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

describe('showToast popover host', () => {
  afterEach(() => sinon.restore());

  it('opens a closed host without hiding it first', () => {
    const hide = sinon.spy(HTMLElement.prototype, 'hidePopover');

    showToast({ text: 'hello', timeout: null });

    expect(hide.called).to.be.false;
    expect(document.getElementById(HOST_ID).matches(':popover-open')).to.be.true;
  });

  it('reopens an open host for subsequent notifications', () => {
    showToast({ text: 'first', timeout: null });
    const host = document.getElementById(HOST_ID);
    const hide = sinon.spy(host, 'hidePopover');
    const show = sinon.spy(host, 'showPopover');

    showToast({ text: 'second', timeout: null });

    expect(hide.calledOnce).to.be.true;
    expect(show.calledOnce).to.be.true;
    expect(hide.calledBefore(show)).to.be.true;
    expect(host.matches(':popover-open')).to.be.true;
    expect(host.querySelectorAll('nx-toast')).to.have.lengthOf(2);
  });

  it('still appends notifications when the popover API is unsupported', () => {
    sinon.stub(HTMLElement.prototype, 'showPopover').value(undefined);
    sinon.stub(HTMLElement.prototype, 'hidePopover').value(undefined);
    const matches = sinon.spy(HTMLElement.prototype, 'matches');

    showToast({ text: 'hello', timeout: null });

    const host = document.getElementById(HOST_ID);
    expect(host.querySelector('nx-toast').message).to.equal('hello');
    expect(matches.calledWith(':popover-open')).to.be.false;
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

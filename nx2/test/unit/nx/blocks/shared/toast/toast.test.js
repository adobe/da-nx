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
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => clock.restore());

  it('clamps timeout below 6000ms to 6000ms', () => {
    showToast({ text: 'hello', timeout: 100 });
    clock.tick(5999);
    expect(document.querySelector('nx-toast')).to.not.be.null;
    clock.tick(1);
    expect(document.querySelector('nx-toast')).to.be.null;
  });

  it('respects timeout values above 6000ms', () => {
    showToast({ text: 'hello', timeout: 8000 });
    clock.tick(7999);
    expect(document.querySelector('nx-toast')).to.not.be.null;
    clock.tick(1);
    expect(document.querySelector('nx-toast')).to.be.null;
  });
});

// ─── dismiss ─────────────────────────────────────────────────────────────────

describe('NxToast dismiss', () => {
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => clock.restore());

  it('removes the element and cancels the pending timer', () => {
    showToast({ text: 'hello' });
    expect(clock.countTimers()).to.equal(1);
    document.querySelector('nx-toast').dismiss();
    expect(document.querySelector('nx-toast')).to.be.null;
    expect(clock.countTimers()).to.equal(0);
  });
});

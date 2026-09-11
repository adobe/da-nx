/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../../scripts/nx.js';

const nextTick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// ew-actions.js captures getConfig() at import time, so config must resolve first.
await setConfig({ hostnames: [] });
await import('../../../../../blocks/ew-actions/ew-actions.js');

describe('nx-ew-actions preflight gate (Gate #1)', () => {
  function make(hashState) {
    const el = document.createElement('nx-ew-actions');
    if (hashState) el._hashState = hashState;
    return el;
  }

  it('requestPreflight dispatches nx-preflight-run and resolves with the matching status', async () => {
    const el = make();
    let runDetail;
    document.addEventListener('nx-preflight-run', (e) => { runDetail = e.detail; }, { once: true });
    const pending = el.requestPreflight('/org/site/page.html');
    await nextTick();
    expect(runDetail.paths).to.deep.equal(['/org/site/page.html']);
    document.dispatchEvent(new CustomEvent('nx-preflight-status', {
      detail: { path: '/org/site/page.html', status: 'success', requestId: runDetail.requestId },
    }));
    expect(await pending).to.equal('success');
  });

  it('requestPreflight ignores a status with a mismatched requestId', async () => {
    const el = make();
    let runDetail;
    document.addEventListener('nx-preflight-run', (e) => { runDetail = e.detail; }, { once: true });
    const pending = el.requestPreflight('/org/site/page.html');
    await nextTick();
    document.dispatchEvent(new CustomEvent('nx-preflight-status', {
      detail: { path: '/org/site/page.html', status: 'success', requestId: 'other' },
    }));
    document.dispatchEvent(new CustomEvent('nx-preflight-status', {
      detail: { path: '/org/site/page.html', status: 'fail', requestId: runDetail.requestId },
    }));
    expect(await pending).to.equal('fail');
  });

  it('_onPreflightStatus tracks the verdict for the current document', () => {
    const el = make({ org: 'org', site: 'site', path: '/page' });
    const { fullpath } = el._prepareDetails;
    el._onPreflightStatus({ detail: { path: fullpath, status: 'success' } });
    expect(el._preflightPassed).to.equal(true);
    el._onPreflightStatus({ detail: { path: fullpath, status: 'fail' } });
    expect(el._preflightPassed).to.equal(false);
  });

  it('_onPreflightStatus ignores a status for a different path', () => {
    const el = make({ org: 'org', site: 'site', path: '/page' });
    el._preflightPassed = false;
    el._onPreflightStatus({ detail: { path: '/other/doc', status: 'success' } });
    expect(el._preflightPassed).to.equal(false);
  });
});

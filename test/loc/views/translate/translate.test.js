import { expect } from '@esm-bundle/chai';
import '../../../../nx/blocks/loc/views/translate/translate.js';

function createTranslateEl() {
  const el = document.createElement('nx-loc-translate');
  // Stand-in for renderRoot, avoiding connectedCallback's service setup.
  el.renderRoot = document.createElement('div');
  return el;
}

describe('NxLocTranslate - update() message guard', () => {
  it('keeps a local connector error visible through an incidental parent message prop change', () => {
    const el = createTranslateEl();
    el._message = { text: 'Failed to save/start GlobalLink submission.', type: 'error' };
    el.message = undefined;

    el.update(new Map([['message', { text: 'Saving...' }]]));

    expect(el._message).to.deep.equal({ text: 'Failed to save/start GlobalLink submission.', type: 'error' });
  });

  it('keeps a local error through the parent transient "Saving..." message', () => {
    const el = createTranslateEl();
    el._message = { text: 'Connector failed.', type: 'error' };
    el.message = { text: 'Saving...', transient: true };

    el.update(new Map([['message', undefined]]));

    expect(el._message).to.deep.equal({ text: 'Connector failed.', type: 'error' });
  });

  it('replaces a local error with a non-error parent message', () => {
    const el = createTranslateEl();
    el._message = { text: 'Connector failed.', type: 'error' };
    el.message = { text: 'Project loaded.' };

    el.update(new Map([['message', undefined]]));

    expect(el._message).to.deep.equal({ text: 'Project loaded.' });
  });

  it('still applies a newer error pushed down from the parent', () => {
    const el = createTranslateEl();
    el._message = { text: 'Failed to save/start GlobalLink submission.', type: 'error' };
    el.message = { text: 'A different error occurred.', type: 'error' };

    el.update(new Map([['message', { text: 'Saving...' }]]));

    expect(el._message).to.deep.equal({ text: 'A different error occurred.', type: 'error' });
  });

  it('syncs down the parent message as usual when there is no local error', () => {
    const el = createTranslateEl();
    el._message = { text: 'Saving...' };
    el.message = undefined;

    el.update(new Map([['message', { text: 'Saving...' }]]));

    expect(el._message).to.equal(undefined);
  });
});

/**
 * Creates an unattached translate element with the collaborators of
 * `handleGetStatus` stubbed out.
 * @param {Object} params
 * @param {Function} params.getStatusAll - Stub for the connector's getStatusAll.
 * @returns {{ el: HTMLElement, calls: { saved: number } }} The element and call counters.
 */
function createEl({ getStatusAll }) {
  const el = document.createElement('nx-loc-translate');
  const calls = { saved: 0 };
  el._service = { connector: { getStatusAll } };
  el.getBaseTranslationConf = async () => ({ langs: [] });
  el.checkAndSaveLangs = async () => {};
  el.handleSaveLangs = () => { calls.saved += 1; };
  return { el, calls };
}

describe('Translate view handleGetStatus', () => {
  it('ignores a second call while a status check is in flight', async () => {
    let release;
    let started = 0;
    const getStatusAll = () => {
      started += 1;
      return new Promise((resolve) => { release = resolve; });
    };
    const { el, calls } = createEl({ getStatusAll });

    const first = el.handleGetStatus();
    await new Promise((resolve) => { setTimeout(resolve); });
    await el.handleGetStatus();
    expect(started).to.equal(1);

    release();
    await first;
    expect(calls.saved).to.equal(1);
  });

  it('allows another check once the previous one finishes', async () => {
    let started = 0;
    const { el } = createEl({ getStatusAll: async () => { started += 1; } });

    await el.handleGetStatus();
    await el.handleGetStatus();

    expect(started).to.equal(2);
  });

  it('clears the busy flag when the status check throws', async () => {
    let started = 0;
    const getStatusAll = async () => {
      started += 1;
      if (started === 1) throw new Error('boom');
    };
    const { el } = createEl({ getStatusAll });

    let thrown;
    try {
      await el.handleGetStatus();
    } catch (e) {
      thrown = e;
    }
    expect(thrown?.message).to.equal('boom');

    await el.handleGetStatus();
    expect(started).to.equal(2);
  });
});

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

describe('NxLocTranslate - Send All retry', () => {
  [false, true].forEach((managed) => {
    it(`clears the previous error before retrying with managed status ${managed}`, async () => {
      const el = createTranslateEl();
      el._service = { connector: { supportsManagedStatus: managed } };
      el._message = { text: 'Previous submission failed.', type: 'error' };
      const state = {};
      const failure = new Error('Could not prepare translation.');
      el.getBaseTranslationConf = async () => {
        state.message = el._message;
        state.busy = el._sendAllBusy;
        throw failure;
      };

      await el.handleSendAll().catch((error) => {
        expect(error).to.equal(failure);
      });

      expect(state.message).to.equal(undefined);
      expect(state.busy).to.equal(true);
      expect(el._sendAllBusy).to.equal(false);
      expect(el._message).to.deep.equal(managed
        ? { text: failure.message, type: 'error' }
        : undefined);
    });
  });
});

describe('NxLocTranslate - checkAndSaveLangs serialization', () => {
  it('runs overlapping calls one at a time', async () => {
    const el = createTranslateEl();
    const events = [];
    el.runCheckAndSaveLangs = async (conf) => {
      events.push(`start-${conf}`);
      await new Promise((resolve) => { setTimeout(resolve, 10); });
      events.push(`end-${conf}`);
    };

    await Promise.all([el.checkAndSaveLangs('a'), el.checkAndSaveLangs('b')]);

    expect(events).to.deep.equal(['start-a', 'end-a', 'start-b', 'end-b']);
  });

  it('keeps running later calls after a rejection', async () => {
    const el = createTranslateEl();
    const calls = [];
    el.runCheckAndSaveLangs = async (conf) => {
      calls.push(conf);
      if (conf === 'a') throw new Error('boom');
    };

    const first = el.checkAndSaveLangs('a');
    const second = el.checkAndSaveLangs('b');

    let caught;
    try {
      await first;
    } catch (e) {
      caught = e;
    }
    await second;

    expect(caught.message).to.equal('boom');
    expect(calls).to.deep.equal(['a', 'b']);
  });
});

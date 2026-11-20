import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { saveErrorsToError } from '../../../../nx/blocks/loc/views/translate/translate.js';

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

      await el.handleSendAll();

      expect(state.message).to.equal(undefined);
      expect(state.busy).to.equal(true);
      expect(el._sendAllBusy).to.equal(false);
      expect(el._message).to.deep.equal({ text: failure.message, type: 'error' });
    });
  });
});

describe('NxLocTranslate - Send All saves finished languages', () => {
  [false, true].forEach((managed) => {
    it(`waits for the save and shows its errors with managed status ${managed}`, async () => {
      const el = createTranslateEl();
      el._service = {
        connector: { supportsManagedStatus: managed, sendAllLanguages: async () => {} },
      };
      el.getBaseTranslationConf = async () => ({ langs: [], langsWithUrls: [], urls: [] });
      let saveDone = false;
      el.checkAndSaveLangs = async () => {
        await new Promise((resolve) => { setTimeout(resolve, 10); });
        saveDone = true;
        throw saveErrorsToError([{ text: 'Error saving French (/a): 500' }]);
      };

      await el.handleSendAll();

      expect(saveDone).to.equal(true);
      expect(el._sendAllBusy).to.equal(false);
      expect(el._message).to.deep.equal({ text: 'Error saving French (/a): 500', type: 'error' });
    });
  });
});

describe('saveErrorsToError', () => {
  const errors = (count) => Array.from({ length: count }, (_, i) => ({ text: `Error ${i + 1}` }));

  it('uses the only error as the message', () => {
    const error = saveErrorsToError(errors(1));
    expect(error.message).to.equal('Error 1');
    expect(error.items).to.equal(undefined);
  });

  it('lists up to five errors', () => {
    const error = saveErrorsToError(errors(5));
    expect(error.message).to.equal('5 items failed to save:');
    expect(error.items).to.deep.equal(['Error 1', 'Error 2', 'Error 3', 'Error 4', 'Error 5']);
  });

  it('summarizes errors past the first five', () => {
    const error = saveErrorsToError(errors(100));
    expect(error.message).to.equal('100 items failed to save:');
    expect(error.items).to.have.length(6);
    expect(error.items[5]).to.equal('…and 95 more.');
  });
});

describe('NxLocTranslate - Get status errors', () => {
  const setup = (statusMessage, saveMessage) => {
    const el = createTranslateEl();
    el._service = {
      connector: { getStatusAll: async () => el.handleMessage(statusMessage) },
    };
    el.getBaseTranslationConf = async () => ({ langs: [], urls: [] });
    el.checkAndSaveLangs = async () => {
      el.handleMessage({ text: 'Checking for languages to save' });
      el.handleMessage(saveMessage);
    };
    el.handleSaveLangs = () => {};
    return el;
  };

  it('keeps a status error visible after checking languages to save', async () => {
    const error = { type: 'error', text: 'Translated reported 2 failures:', items: ['a', 'b'] };
    const el = setup(error, undefined);

    await el.handleGetStatus();

    expect(el._message).to.equal(error);
  });

  it('prefers a newer error from saving languages', async () => {
    const saveError = { type: 'error', text: 'Save failed.' };
    const el = setup({ type: 'error', text: 'Status failed.' }, saveError);

    await el.handleGetStatus();

    expect(el._message).to.equal(saveError);
  });

  it('clears the message when status had no error', async () => {
    const el = setup(undefined, undefined);

    await el.handleGetStatus();

    expect(el._message).to.equal(undefined);
  });

  it('shows save errors and still persists the status', async () => {
    const el = setup(undefined, undefined);
    el.checkAndSaveLangs = async () => {
      throw saveErrorsToError([{ text: 'Error saving French (/a): 500' }, { text: 'Error saving German (/a): 500' }]);
    };
    let persisted = 0;
    el.handleSaveLangs = () => { persisted += 1; };

    await el.handleGetStatus();

    expect(el._message).to.deep.equal({
      text: '2 items failed to save:',
      type: 'error',
      items: ['Error saving French (/a): 500', 'Error saving German (/a): 500'],
    });
    expect(el._getStatusBusy).to.equal(false);
    expect(persisted).to.equal(1);
  });
});

describe('NxLocTranslate - service link', () => {
  const renderLink = (service) => {
    const el = createTranslateEl();
    el._options = { service };
    const target = document.createElement('p');
    render(el.renderServiceLink(), target);
    return target;
  };

  it('links the service name when the connector set a link', () => {
    const target = renderLink({ name: 'Translated', link: 'https://os.translated.com/orgs/1/request-groups/id_order_group/g' });
    const a = target.querySelector('a');
    expect(a.textContent).to.equal('Translated');
    expect(a.href).to.equal('https://os.translated.com/orgs/1/request-groups/id_order_group/g');
    expect(a.target).to.equal('_blank');
  });

  it('shows the plain service name without a link', () => {
    const target = renderLink({ name: 'Translated' });
    expect(target.querySelector('a')).to.equal(null);
    expect(target.textContent).to.equal('Translated');
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

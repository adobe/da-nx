import { expect } from '@esm-bundle/chai';
import '../../../../nx/blocks/loc/views/translate/translate.js';

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

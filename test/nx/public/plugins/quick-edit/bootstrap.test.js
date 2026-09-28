import { expect } from '@esm-bundle/chai';
import loadQuickEdit, { claimBootstrap } from '../../../../../nx/public/plugins/quick-edit/quick-edit.js';
import { getBootstrapPayload } from '../../../../../nx/public/plugins/quick-edit/quick-edit-init.js';
import { MESSAGE_TYPES } from '../../../../../nx/utils/message-types.js';

const query = (value) => `?quick-edit=${encodeURIComponent(value)}`;

describe('getBootstrapPayload', () => {
  it('defaults to an empty payload', () => {
    expect(getBootstrapPayload('?quick-edit=on')).to.deep.equal({});
    expect(getBootstrapPayload(query('{}'))).to.deep.equal({});
    expect(getBootstrapPayload(query('not json'))).to.deep.equal({});
    expect(getBootstrapPayload(query('null'))).to.deep.equal({});
  });

  it('keeps payload fields and unwraps detail', () => {
    expect(getBootstrapPayload(query('{"config":{"a":1}}')))
      .to.deep.equal({ config: { a: 1 } });
    expect(getBootstrapPayload(query('{"detail":{"config":{"canWrite":true}}}')))
      .to.deep.equal({ config: { canWrite: true } });
  });
});

describe('claimBootstrap', () => {
  const originalUrl = new URL(window.location.href);

  afterEach(() => window.history.replaceState({}, '', originalUrl));

  function sendInit() {
    const channel = new MessageChannel();
    const ready = new Promise((resolve) => {
      channel.port2.onmessage = () => resolve(true);
      setTimeout(() => resolve(false), 200);
    });
    const init = new MessageEvent('message', {
      data: { type: MESSAGE_TYPES.INIT, payload: { config: { canWrite: false } } },
      ports: [channel.port1],
    });
    Object.defineProperty(init, 'source', { value: window.parent });
    window.dispatchEvent(init);
    return ready.finally(() => {
      channel.port1.close();
      channel.port2.close();
    });
  }

  it('ignores other loaders once quick-edit-init owns loading', async () => {
    const url = new URL(originalUrl);
    url.searchParams.set('controller', 'parent');
    window.history.replaceState({}, '', url);
    claimBootstrap();

    loadQuickEdit({}, () => {}, { partialReload: true });
    expect(await sendInit()).to.equal(false);

    loadQuickEdit({}, () => {}, { bootstrap: true, partialReload: true });
    expect(await sendInit()).to.equal(true);
  });
});

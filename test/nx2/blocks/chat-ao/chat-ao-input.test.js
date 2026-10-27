import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../nx2/scripts/nx.js';

await setConfig({ hostnames: [] });
await import('../../../../nx2/blocks/chat-ao/chat-ao.js');

describe('chat AO composer', () => {
  let chat;
  let input;
  let originalFetch;

  beforeEach(async () => {
    originalFetch = window.fetch;
    window.fetch = (resource, options) => {
      if (String(resource).includes('/api/v1/overrides/user/resolved')) {
        return Promise.resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
      }
      return originalFetch(resource, options);
    };
    chat = document.createElement('nx-chat-ao');
    chat._explicitContext = true;
    chat._controller = { destroy() {}, reattachIfIdle() {} };
    chat.messages = [{ role: 'user', content: 'Hello' }];
    document.body.append(chat);
    await chat.updateComplete;
    input = chat.shadowRoot.querySelector('.chat-input');
  });

  afterEach(() => {
    chat.remove();
    window.fetch = originalFetch;
  });

  it('disables input while thinking and enables it when thinking stops', async () => {
    expect(input.disabled).to.be.false;
    chat.thinking = true;
    await chat.updateComplete;
    expect(input.disabled).to.be.true;
    chat.thinking = false;
    await chat.updateComplete;
    expect(input.disabled).to.be.false;
  });
});

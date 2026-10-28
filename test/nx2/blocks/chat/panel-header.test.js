import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { PANEL_EVENT } from '../../../../nx2/utils/panel.js';
import '../../../../nx2/blocks/chat/chat.js';
import '../../../../nx2/blocks/chat-ao/chat-ao.js';

describe('chat panel headers', () => {
  [
    { tag: 'nx-chat', action: 'Clear chat' },
    { tag: 'nx-chat-ao', action: 'New chat' },
  ].forEach(({ tag, action }) => {
    it(`${tag} closes its panel without clearing the conversation`, () => {
      const chat = document.createElement(tag);
      chat._dnd = {};
      const messages = [{ role: 'user', content: 'Keep this conversation' }];
      chat.messages = messages;
      const events = [];
      chat.addEventListener(PANEL_EVENT.CLOSE, (event) => events.push(event));
      const container = document.createElement('div');
      render(chat.render(), container);
      const header = container.querySelector('.chat-header');
      expect(header.querySelector(`button[aria-label="${action}"]`)).not.to.equal(null);
      const close = header.querySelector('button[aria-label="Close chat panel"]');
      expect(close.querySelector('svg path')).not.to.equal(null);
      close.click();
      expect(events).to.have.length(1);
      expect(events[0].bubbles).to.equal(true);
      expect(events[0].composed).to.equal(true);
      expect(chat.messages).to.equal(messages);
    });
  });
});

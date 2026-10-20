import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import '../../../../nx2/blocks/chat/chat.js';
import '../../../../nx2/blocks/chat-ao/chat-ao.js';

describe('chat send button RUM', () => {
  for (const [tag, harness] of [['nx-chat', 'da-agent'], ['nx-chat-ao', 'coworker']]) {
    it(`records valid ${harness} button and Enter submissions as standard clicks`, () => {
      const previousHlx = window.hlx;
      const calls = [];
      const messages = [];
      const container = document.createElement('div');
      window.hlx = { rum: { isSelected: true, collector: (...args) => calls.push(args) } };
      try {
        const chat = document.createElement(tag);
        chat._controller = {
          sendMessage(message) { messages.push(message); },
          stop() {},
        };
        chat._slashMenu = { close() {}, onKeydown() { return false; } };
        chat._dnd = {
          onDragEnter() {}, onDragLeave() {}, onDragOver() {}, onDrop() {},
        };
        document.body.append(container);
        render(chat.render(), container, { host: chat });
        chat.attachShadow({ mode: 'open' }).querySelector = (selector) => container.querySelector(selector);
        const button = container.querySelector('.chat-send');
        expect(button.classList.contains(`harness-${harness}`)).to.equal(true);
        const input = container.querySelector('.chat-input');
        input.value = 'hello';
        button.click();
        input.value = 'again';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        button.click();
        chat.thinking = true;
        input.value = 'stopped';
        chat._submit();
        expect(messages).to.deep.equal(['hello', 'again']);
        expect(calls.map(([checkpoint, data]) => [checkpoint, data])).to.deep.equal([
          ['click', { source: 'chat-submit', target: `button.chat-send.harness-${harness}` }],
          ['click', { source: 'chat-submit', target: `button.chat-send.harness-${harness}` }],
        ]);
      } finally {
        container.remove();
        window.hlx = previousHlx;
      }
    });
  }
});

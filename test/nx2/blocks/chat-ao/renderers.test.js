import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderMessages as renderAoMessages, renderPermissionCard } from '../../../../nx2/blocks/chat-ao/renderers.js';
import { renderMessages as renderChatMessages } from '../../../../nx2/blocks/chat/renderers/renderers.js';
import { getResponseCopies } from '../../../../nx2/blocks/shared/chat/copy-button.js';

function mount(pending, onDecide) {
  const host = document.createElement('div');
  render(renderPermissionCard(pending, { onDecide }), host);
  return host;
}

describe('renderPermissionCard keydown', () => {
  const pending = {
    calls: [{ toolCallId: 'tc1', toolName: 'some_tool', arguments: {} }],
    decisions: {},
  };

  it('Escape rejects, regardless of which element (or none) currently has focus', () => {
    const decisions = [];
    const host = mount(pending, (id, approved) => decisions.push({ id, approved }));
    host.querySelector('.permission-row-buttons')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(decisions).to.deep.equal([{ id: 'tc1', approved: false }]);
  });

  [
    ['AO', renderAoMessages, {
      role: 'assistant',
      toolCall: { toolCallId: 'tool-1', toolName: 'search', status: 'success', result: 'Private tool output' },
    }],
    ['classic', renderChatMessages, {
      toolCard: { toolName: 'search', detail: 'Private tool output', state: 'done' },
    }],
  ].forEach(([name, renderMessages, activity]) => {
    describe(`${name} assistant response copy`, () => {
      const user = (content) => ({ role: 'user', content });
      const assistant = (content) => ({ role: 'assistant', content });
      let writeText;
      let copied;

      beforeEach(() => {
        copied = [];
        writeText = navigator.clipboard.writeText;
        navigator.clipboard.writeText = async (text) => { copied.push(text); };
      });

      afterEach(() => {
        navigator.clipboard.writeText = writeText;
      });

      it('copies all assistant text once after the final activity, excluding user and tool content', () => {
        const host = document.createElement('div');
        render(renderMessages({
          messages: [
            user('Find my files'),
            assistant('I will **search** for your files.'),
            activity,
            assistant('Found [your file](https://example.com/file).'),
            activity,
          ],
        }), host);
        const buttons = host.querySelectorAll('.message-action-copy');
        expect(buttons).to.have.length(1);
        expect(host.lastElementChild.contains(buttons[0])).to.equal(true);
        buttons[0].click();
        expect(copied).to.deep.equal([
          'I will **search** for your files.\n\nFound [your file](https://example.com/file).',
        ]);
      });

      it('waits for the whole response, not an individual text chunk, to finish', () => {
        const host = document.createElement('div');
        const messages = [user('Search'), assistant('Starting the search.'), activity];
        render(renderMessages({ messages, thinking: true }), host);
        expect(host.querySelector('.message-action-copy')).to.equal(null);
        render(renderMessages({
          messages: [...messages, { ...assistant('Found'), streaming: true }],
        }), host);
        expect(host.querySelector('.message-action-copy')).to.equal(null);
        render(renderMessages({
          messages: [...messages, assistant('Found everything.')], thinking: true,
        }), host);
        expect(host.querySelector('.message-action-copy')).to.equal(null);
        render(renderMessages({ messages: [...messages, assistant('Found everything.')] }), host);
        expect(host.querySelectorAll('.message-action-copy')).to.have.length(1);
        host.querySelector('.message-action-copy').click();
        expect(copied).to.deep.equal(['Starting the search.\n\nFound everything.']);
      });

      it('keeps earlier responses copyable while the next response is in progress', () => {
        const host = document.createElement('div');
        const messages = [
          user('First question'), assistant('First answer.'),
          user('Second question'), assistant('Second answer.'), activity,
        ];
        render(renderMessages({ messages, thinking: true }), host);
        expect(host.querySelectorAll('.message-action-copy')).to.have.length(1);
        host.querySelector('.message-action-copy').click();
        expect(copied).to.deep.equal(['First answer.']);
        render(renderMessages({ messages }), host);
        expect(host.querySelectorAll('.message-action-copy')).to.have.length(2);
        host.querySelectorAll('.message-action-copy')[1].click();
        expect(copied).to.deep.equal(['First answer.', 'Second answer.']);
      });

      it('does not offer an empty copy action for tool-only or empty responses', () => {
        const host = document.createElement('div');
        render(renderMessages({ messages: [user('Search'), activity] }), host);
        expect(host.querySelector('.message-action-copy')).to.equal(null);
        expect(getResponseCopies({ messages: [user('Search'), assistant('  ')] }).size).to.equal(0);
      });

      it('supports restored response history and a single assistant greeting', () => {
        const host = document.createElement('div');
        render(renderMessages({ messages: [assistant('Welcome!')] }), host);
        host.querySelector('.message-action-copy').click();
        expect(copied).to.deep.equal(['Welcome!']);
        render(renderMessages({
          messages: [user('Search'), activity, assistant('First paragraph.'), assistant('Last paragraph.')],
        }), host);
        expect(host.querySelectorAll('.message-action-copy')).to.have.length(1);
        host.querySelector('.message-action-copy').click();
        expect(copied).to.deep.equal(['Welcome!', 'First paragraph.\n\nLast paragraph.']);
      });
    });
  });

  it('does not intercept Enter at the wrapper — leaves it to native per-button activation', () => {
    const decisions = [];
    const host = mount(pending, (id, approved) => decisions.push({ id, approved }));
    host.querySelector('.permission-row-buttons')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(decisions).to.deep.equal([]);
  });

  it('ignores keys other than Enter/Escape', () => {
    const decisions = [];
    const host = mount(pending, (id, approved) => decisions.push({ id, approved }));
    host.querySelector('.permission-row-buttons')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    expect(decisions).to.deep.equal([]);
  });
});

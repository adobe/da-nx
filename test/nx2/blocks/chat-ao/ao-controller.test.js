import { expect } from '@esm-bundle/chai';
import AoChatController from '../../../../nx2/blocks/chat-ao/ao-controller.js';

function makeController() {
  const updates = [];
  const sent = [];
  const controller = new AoChatController({ onUpdate: (u) => updates.push(u) });
  controller._ensureSocket = async () => { };
  controller._authFrame = async () => ({ type: 'AUTH' });
  controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };
  return { controller, updates, sent };
}

describe('ao-controller sendMessage', () => {
  it('sends AUTH followed by USER_INPUT, without waiting on any ready signal', async () => {
    const { controller, updates, sent } = makeController();

    await controller.sendMessage('hello AO');

    expect(controller._messages).to.deep.equal([{ role: 'user', content: 'hello AO' }]);
    expect(updates[0].thinking).to.equal(true);
    expect(sent).to.deep.equal([
      { type: 'AUTH' },
      { type: 'USER_INPUT', text: 'hello AO', manifestId: 'experience-workspace', debugMode: true },
    ]);
  });

  it('is a no-op while a turn is already in flight', async () => {
    const { controller, sent } = makeController();
    controller._thinking = true;

    await controller.sendMessage('hello again');

    expect(sent).to.have.length(0);
  });

  it('prefixes selected context items into the wire text, not the shown message', async () => {
    const { controller, sent } = makeController();

    await controller.sendMessage('what does this do?', [
      { type: 'block', blockName: 'hero', id: 'a' },
      { type: 'text', innerHTML: '<p>hello <b>world</b></p>', id: 'b' },
    ]);

    expect(controller._messages).to.deep.equal([{ role: 'user', content: 'what does this do?' }]);
    expect(sent[1].text).to.equal(
      '[Selected context]\n- Selected block: hero\n- Selected text: "hello world"\nwhat does this do?',
    );
  });

  it('is a no-op for an empty message', async () => {
    const { controller, sent } = makeController();

    await controller.sendMessage('');

    expect(sent).to.have.length(0);
  });

  it('surfaces a socket failure as an assistant error and clears thinking', async () => {
    const { controller, updates } = makeController();
    controller._ensureSocket = async () => { throw new Error('AO WebSocket error'); };

    await controller.sendMessage('hello AO');

    expect(controller._messages.at(-1)).to.deep.equal({
      role: 'assistant', content: 'Error: AO WebSocket error',
    });
    expect(updates.at(-1).thinking).to.equal(false);
  });
});

describe('ao-controller streamed text', () => {
  it('accumulates TEXT_DELTA into streamingText', () => {
    const { controller, updates } = makeController();

    controller._handleServerEvent({ type: 'text_delta', data: { content: 'Hel' } });
    controller._handleServerEvent({ type: 'text_delta', data: { content: 'lo' } });

    expect(updates.at(-1).streamingText).to.equal('Hello');
  });

  it('finalizes TEXT_DONE into a message and clears streamingText', () => {
    const { controller, updates } = makeController();
    controller._streaming = 'Hello';

    controller._handleServerEvent({ type: 'text_done', data: { content: 'Hello there' } });

    expect(controller._messages).to.deep.equal([{ role: 'assistant', content: 'Hello there' }]);
    expect(updates.at(-1).streamingText).to.equal(undefined);
  });
});

describe('ao-controller turn lifecycle', () => {
  it('clears thinking on TURN_COMPLETED', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;

    controller._handleServerEvent({ type: 'turn_completed' });

    expect(updates.at(-1).thinking).to.equal(false);
  });

  it('surfaces a session-level error as an assistant message', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;

    controller._handleServerEvent({ type: 'error', data: { message: 'model unavailable' } });

    expect(controller._messages).to.deep.equal([
      { role: 'assistant', content: 'Error: model unavailable' },
    ]);
    expect(updates.at(-1).thinking).to.equal(false);
  });
});

describe('ao-controller stop', () => {
  it('stop sends an INTERRUPT frame when the socket is open', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;
    controller._ws.readyState = WebSocket.OPEN;
    const sent = [];
    controller._ws.send = (msg) => sent.push(JSON.parse(msg));

    controller.stop();

    expect(sent).to.deep.equal([{ type: 'INTERRUPT' }]);
    expect(updates.at(-1).thinking).to.equal(false);
  });

  it('stop is a no-op send when there is no open socket, but still clears thinking', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;
    controller._ws = null;

    controller.stop();

    expect(updates.at(-1).thinking).to.equal(false);
  });
});

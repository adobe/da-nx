import { expect } from '@esm-bundle/chai';
import ChatControllerAO from '../../../../../nx2/blocks/chat/ao/chat-controller-ao.js';

// Builds a controller with the network-adjacent bits stubbed out (no WebSocket) so
// these tests can drive the same internal handler methods connect()/_openSocket()
// would call, the way chat-controller.test.js does for the da-agent controller —
// direct instance manipulation, not a live connection.
function makeController() {
  const updates = [];
  const controller = new ChatControllerAO({ onUpdate: (u) => updates.push(u) });
  controller._messages = [];
  return { controller, updates };
}

describe('chat-controller-ao ui artifacts', () => {
  it('stores a ui_artifact_created event as a message with a uiArtifact field', () => {
    const { controller, updates } = makeController();

    controller._handleUiArtifactCreated({
      data: {
        artifact: {
          id: 'art-1',
          a2ui_surface: { components: [{ type: 'Markdown', props: { content: 'hi' } }] },
          text_fallback: 'hi',
          display_hints: { title: 'Summary' },
        },
      },
    });

    const msg = controller._messages.at(-1);
    expect(msg.uiArtifact).to.deep.equal({
      id: 'art-1',
      components: [{ type: 'Markdown', props: { content: 'hi' } }],
      textFallback: 'hi',
      title: 'Summary',
    });
    expect(updates.at(-1).messages.at(-1)).to.equal(msg);
  });
});

describe('chat-controller-ao server events', () => {
  it('accumulates text_delta chunks into streamingText', () => {
    const { controller, updates } = makeController();
    controller._streaming = '';

    controller._handleServerEvent({ type: 'text_delta', data: { content: 'Hel' } });
    controller._handleServerEvent({ type: 'text_delta', data: { content: 'lo' } });

    expect(updates.at(-1).streamingText).to.equal('Hello');
  });

  it('finalizes into a message on text_done and clears streamingText', () => {
    const { controller, updates } = makeController();
    controller._streaming = 'Hello';

    controller._handleServerEvent({ type: 'text_done', data: {} });

    expect(controller._messages.at(-1)).to.deep.equal({ role: 'assistant', content: 'Hello' });
    expect(updates.at(-1).streamingText).to.equal(undefined);
  });

  it('ends the turn on turn_completed', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;

    controller._handleServerEvent({ type: 'turn_completed' });

    expect(updates.at(-1).thinking).to.equal(false);
  });

  it('ends the turn on turn_suspended — no interaction type left in this controller can keep it open', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;

    controller._handleServerEvent({ type: 'turn_suspended' });

    expect(updates.at(-1).thinking).to.equal(false);
  });

  it('surfaces a session-level error as an assistant message and ends the turn', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;

    controller._handleServerEvent({ type: 'error', data: { message: 'model unavailable' } });

    expect(controller._messages.at(-1)).to.deep.equal({
      role: 'assistant', content: 'Error: model unavailable',
    });
    expect(updates.at(-1).thinking).to.equal(false);
  });
});

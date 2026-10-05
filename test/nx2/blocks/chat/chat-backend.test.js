import { expect } from '@esm-bundle/chai';
import ChatBackend from '../../../../nx2/blocks/chat/chat-backend.js';
import ChatController from '../../../../nx2/blocks/chat/chat-controller.js';
import { TOOL_STATE } from '../../../../nx2/blocks/chat/constants.js';

function makeBackend() {
  const updates = [];
  const backend = new ChatBackend({ onUpdate: (u) => updates.push(u) });
  return { backend, updates };
}

// Drives ChatBackend's normalization the same way the real controller would: through
// the onUpdate it installed on the wrapped controller at construction, not by calling
// _normalize() directly — this also proves the wiring, not just the merge logic.
function emit(backend, payload) {
  backend._controller._onUpdate(payload);
}

describe('ChatBackend controller selection', () => {
  it('wraps ChatController', () => {
    expect(makeBackend().backend._controller).to.be.instanceOf(ChatController);
  });
});

describe('ChatBackend normalization', () => {
  it('derives an approval pendingInteraction from an awaiting-approval tool card', () => {
    const { backend, updates } = makeBackend();
    const toolCards = new Map([
      ['t1', {
        toolName: 'content_create',
        input: { humanReadableSummary: 'Create /a/b' },
        state: TOOL_STATE.AWAITING_APPROVAL,
      }],
    ]);

    emit(backend, { toolCards });

    expect(updates.at(-1).pendingInteraction).to.deep.equal({
      type: 'approval', toolCallId: 't1', toolName: 'content_create', summary: 'Create /a/b',
    });
  });

  it('reports no pendingInteraction when no tool card is awaiting approval', () => {
    const { backend, updates } = makeBackend();
    const toolCards = new Map([
      ['t1', { toolName: 'content_read', input: {}, state: TOOL_STATE.OUTPUT_AVAILABLE }],
    ]);

    emit(backend, { toolCards });

    expect(updates.at(-1).pendingInteraction).to.equal(null);
  });

  it('summary is null when the tool input has none of the known field names', () => {
    const { backend, updates } = makeBackend();
    const toolCards = new Map([
      ['t1', { toolName: 'mystery_tool', input: { foo: 'bar' }, state: TOOL_STATE.AWAITING_APPROVAL }],
    ]);

    emit(backend, { toolCards });

    expect(updates.at(-1).pendingInteraction.summary).to.equal(null);
  });
});

describe('ChatBackend pass-through delegation', () => {
  it('forwards setContext and approveToolCall to the wrapped controller, unchanged', () => {
    const { backend } = makeBackend();
    const calls = [];
    backend._controller.setContext = (...args) => calls.push(['setContext', args]);
    backend._controller.approveToolCall = (...args) => calls.push(['approveToolCall', args]);

    backend.setContext({ org: 'o', site: 's' });
    backend.approveToolCall('t1', true, false);

    expect(calls).to.deep.equal([
      ['setContext', [{ org: 'o', site: 's' }]],
      ['approveToolCall', ['t1', true, false]],
    ]);
  });
});

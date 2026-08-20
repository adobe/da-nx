import { expect } from '@esm-bundle/chai';
import ChatBackend from '../../../../nx2/blocks/chat/chat-backend.js';
import ChatController from '../../../../nx2/blocks/chat/chat-controller.js';
import ChatControllerAO from '../../../../nx2/blocks/chat/ao/chat-controller-ao.js';
import { TOOL_STATE } from '../../../../nx2/blocks/chat/constants.js';

function makeBackend(useAo) {
  const updates = [];
  const backend = new ChatBackend(useAo, { onUpdate: (u) => updates.push(u) });
  return { backend, updates };
}

// Drives ChatBackend's normalization the same way the real controller would: through
// the onUpdate it installed on the wrapped controller at construction, not by calling
// _normalize() directly — this also proves the wiring, not just the merge logic.
function emit(backend, payload) {
  backend._controller._onUpdate(payload);
}

describe('ChatBackend controller selection', () => {
  it('wraps ChatController when useAgentOrchestrator is false', () => {
    expect(makeBackend(false).backend._controller).to.be.instanceOf(ChatController);
  });

  it('wraps ChatControllerAO when useAgentOrchestrator is true', () => {
    expect(makeBackend(true).backend._controller).to.be.instanceOf(ChatControllerAO);
  });
});

describe('ChatBackend normalization — da-agent', () => {
  it('derives an approval pendingInteraction from an awaiting-approval tool card', () => {
    const { backend, updates } = makeBackend(false);
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
    const { backend, updates } = makeBackend(false);
    const toolCards = new Map([
      ['t1', { toolName: 'content_read', input: {}, state: TOOL_STATE.OUTPUT_AVAILABLE }],
    ]);

    emit(backend, { toolCards });

    expect(updates.at(-1).pendingInteraction).to.equal(null);
  });

  it('summary is null when the tool input has none of the known field names', () => {
    const { backend, updates } = makeBackend(false);
    const toolCards = new Map([
      ['t1', { toolName: 'mystery_tool', input: { foo: 'bar' }, state: TOOL_STATE.AWAITING_APPROVAL }],
    ]);

    emit(backend, { toolCards });

    expect(updates.at(-1).pendingInteraction.summary).to.equal(null);
  });
});

describe('ChatBackend normalization — AO', () => {
  it('tags a passed-through pendingApproval with type: approval', () => {
    const { backend, updates } = makeBackend(true);
    const pendingApproval = { toolCallId: 'c1', toolName: 'content_create', summary: '/a/b' };

    emit(backend, { toolCards: new Map(), pendingApproval });

    expect(updates.at(-1).pendingInteraction).to.deep.equal({ type: 'approval', ...pendingApproval });
  });

  it('falls back to pendingPlanApproval when approval is not pending', () => {
    const { backend, updates } = makeBackend(true);
    const pendingPlanApproval = { turnId: 't1', planContent: '# Plan' };

    emit(backend, { toolCards: new Map(), pendingPlanApproval });

    expect(updates.at(-1).pendingInteraction).to.deep.equal({ type: 'plan', ...pendingPlanApproval });
  });

  it('reports no pendingInteraction when nothing is pending', () => {
    const { backend, updates } = makeBackend(true);

    emit(backend, { toolCards: new Map() });

    expect(updates.at(-1).pendingInteraction).to.equal(null);
  });
});

describe('ChatBackend AO-only actions wrapping da-agent', () => {
  it('respondToPlanApproval is a silent no-op', () => {
    const { backend } = makeBackend(false);
    expect(() => backend.respondToPlanApproval('approve')).to.not.throw();
  });
});

describe('ChatBackend pass-through delegation', () => {
  it('forwards setContext and approveToolCall to the wrapped controller, unchanged', () => {
    const { backend } = makeBackend(false);
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

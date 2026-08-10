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

  it('falls back to pendingQuestion when there is no pending approval', () => {
    const { backend, updates } = makeBackend(true);
    const pendingQuestion = { turnId: 't1', questions: [] };

    emit(backend, { toolCards: new Map(), pendingQuestion });

    expect(updates.at(-1).pendingInteraction).to.deep.equal({ type: 'question', ...pendingQuestion });
  });

  it('falls back to pendingPlanApproval when neither approval nor question is pending', () => {
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
  it('getSkills returns null instead of throwing (da-agent has no skill list of its own)', () => {
    expect(makeBackend(false).backend.getSkills()).to.equal(null);
  });

  it('answerQuestion/declineQuestion/respondToPlanApproval/episode actions are silent no-ops', () => {
    const { backend } = makeBackend(false);
    expect(() => backend.answerQuestion({ q1: ['Yes'] })).to.not.throw();
    expect(() => backend.declineQuestion()).to.not.throw();
    expect(() => backend.respondToPlanApproval('approve')).to.not.throw();
    expect(() => backend.switchToLatestEpisode()).to.not.throw();
    expect(() => backend.dismissNewerEpisode()).to.not.throw();
  });
});

describe('ChatBackend AO-only actions wrapping AO', () => {
  it('getSkills delegates to the real controller', () => {
    const { backend } = makeBackend(true);
    backend._controller._cachedSkills = ['writeBlog', 'summarize'];

    expect(backend.getSkills()).to.deep.equal(['writeBlog', 'summarize']);
  });

  it('answerQuestion delegates through to a real QUESTION_RESPONSE frame', () => {
    const { backend } = makeBackend(true);
    backend._controller._pendingQuestion = { turnId: 't1', questions: [{ id: 'q1' }] };
    const sent = [];
    backend._controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };

    backend.answerQuestion({ q1: ['Yes'] });

    expect(sent[0]).to.deep.equal({
      type: 'QUESTION_RESPONSE',
      turn_id: 't1',
      answers: [{ question_id: 'q1', selected_options: ['Yes'] }],
      declined: false,
    });
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

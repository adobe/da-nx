import { expect } from '@esm-bundle/chai';
import ChatControllerAO from '../../../../../nx2/blocks/chat/ao/chat-controller-ao.js';

// Builds a controller with the network-adjacent bits stubbed out (no IndexedDB, no
// WebSocket) so these tests can drive the same internal handler methods connect()/
// _openSocket() would call, the way chat-controller.test.js does for the da-agent
// controller — direct instance manipulation, not a live connection.
function makeController() {
  const updates = [];
  const controller = new ChatControllerAO({ onUpdate: (u) => updates.push(u) });
  controller._messages = [];
  controller._getRoom = async () => 'test-room';
  controller._persist = () => {};
  return { controller, updates };
}

describe('chat-controller-ao permission requests', () => {
  it('surfaces a pending_call as a backend-neutral pendingApproval', () => {
    const { controller, updates } = makeController();
    controller._handlePermissionRequest({
      data: {
        turn_id: 'turn-1',
        pending_calls: [
          { id: 'call-1', name: 'content_create', arguments: JSON.stringify({ path: '/a/b' }) },
        ],
      },
    });
    const last = updates.at(-1);
    expect(last.pendingApproval).to.deep.equal({
      toolCallId: 'call-1', toolName: 'content_create', summary: '/a/b',
    });
    expect(last.toolCards.get('call-1').hidden).to.equal(true);
  });

  it('filters out calls that do not need permission', () => {
    const { controller, updates } = makeController();
    controller._handlePermissionRequest({
      data: {
        turn_id: 't',
        pending_calls: [{ id: 'c1', name: 'x', arguments: '{}', needs_permission: false }],
      },
    });
    expect(updates.at(-1).pendingApproval).to.equal(null);
    expect(updates.at(-1).toolCards.size).to.equal(0);
  });
});

describe('chat-controller-ao approveToolCall', () => {
  function seedPending(controller) {
    controller._toolCards = new Map([
      ['a', {
        toolName: 'content_create', input: {}, state: 'approval-requested', turnId: 'turn-1',
      }],
      ['b', {
        toolName: 'content_create', input: {}, state: 'approval-requested', turnId: 'turn-1',
      }],
    ]);
  }

  it('sends a single-decision PERMISSION_RESPONSE frame', () => {
    const { controller } = makeController();
    seedPending(controller);
    const sent = [];
    controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };

    controller.approveToolCall('a', true);

    expect(sent).to.have.length(1);
    expect(sent[0]).to.deep.equal({
      type: 'PERMISSION_RESPONSE', turn_id: 'turn-1', decisions: { a: { approved: true } },
    });
    expect(controller._toolCards.get('a').state).to.equal('approved');
    expect(controller._toolCards.get('b').state).to.equal('approval-requested');
  });

  it('bulk-approves other pending calls of the same tool on "always approve"', () => {
    const { controller } = makeController();
    seedPending(controller);
    const sent = [];
    controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };

    controller.approveToolCall('a', true, true);

    expect(sent[0].decisions).to.deep.equal({
      a: { approved: true }, b: { approved: true },
    });
    expect(controller._toolCards.get('b').state).to.equal('approved');
  });

  it('marks a rejection without bulk-affecting other pending calls', () => {
    const { controller } = makeController();
    seedPending(controller);
    controller._ws = { send: () => {} };

    controller.approveToolCall('a', false);

    expect(controller._toolCards.get('a').state).to.equal('rejected');
    expect(controller._toolCards.get('b').state).to.equal('approval-requested');
  });

  it('is a no-op for an unknown toolCallId', () => {
    const { controller } = makeController();
    seedPending(controller);
    let sendCalled = false;
    controller._ws = { send: () => { sendCalled = true; } };

    controller.approveToolCall('missing', true);

    expect(sendCalled).to.equal(false);
  });
});

describe('chat-controller-ao questions', () => {
  it('answerQuestion sends merged options + free text per question, then clears', () => {
    const { controller } = makeController();
    controller._pendingQuestion = { turnId: 't1', questions: [{ id: 'q1' }, { id: 'q2' }] };
    const sent = [];
    controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };

    controller.answerQuestion({ q1: ['Yes'], q2: [] });

    expect(sent[0]).to.deep.equal({
      type: 'QUESTION_RESPONSE',
      turn_id: 't1',
      answers: [
        { question_id: 'q1', selected_options: ['Yes'] },
        { question_id: 'q2', selected_options: [] },
      ],
      declined: false,
    });
    expect(controller._pendingQuestion).to.equal(null);
  });

  it('declineQuestion sends declined:true with no answers', () => {
    const { controller } = makeController();
    controller._pendingQuestion = { turnId: 't1', questions: [{ id: 'q1' }] };
    const sent = [];
    controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };

    controller.declineQuestion();

    expect(sent[0]).to.deep.equal({
      type: 'QUESTION_RESPONSE', turn_id: 't1', answers: [], declined: true,
    });
    expect(controller._pendingQuestion).to.equal(null);
  });
});

describe('chat-controller-ao plan approval', () => {
  it('respondToPlanApproval sends a RESUME frame with a plan-response part', () => {
    const { controller } = makeController();
    controller._pendingPlanApproval = { turnId: 't1', planContent: '# Plan' };
    const sent = [];
    controller._ws = { send: (msg) => sent.push(JSON.parse(msg)) };

    controller.respondToPlanApproval('reject', 'needs more detail');

    expect(sent[0]).to.deep.equal({
      type: 'RESUME',
      turn_id: 't1',
      data: {
        type: 'plan-response', decision: 'reject', feedback: 'needs more detail', edited_plan_content: null,
      },
    });
    expect(controller._pendingPlanApproval).to.equal(null);
  });
});

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

  it('does not end the turn on turn_suspended while a question is pending', () => {
    const { controller, updates } = makeController();
    controller._thinking = true;
    controller._pendingQuestion = { turnId: 't1', questions: [] };

    controller._handleServerEvent({ type: 'turn_suspended' });

    // _done() (and therefore _update()) must not fire here — the popup already up
    // is the only valid response channel; re-enabling the input would let the user
    // answer in two conflicting ways at once.
    expect(controller._thinking).to.equal(true);
    expect(updates).to.have.length(0);
  });

  it('ends the turn on turn_suspended when nothing is pending', () => {
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

import { expect } from '@esm-bundle/chai';
import ChatController, { migrateHistory } from '../../../../nx2/blocks/chat/chat-controller.js';
import { TOOL_NAME, TOOL_STATE } from '../../../../nx2/blocks/chat/constants.js';

const TURN = 'turn-current';
const OTHER_TURN = 'turn-previous';

function makeController() {
  const controller = new ChatController({ onUpdate() {}, onToolDone() {} });
  controller._messages = [];
  controller._currentTurnId = TURN;
  return controller;
}

// A v2 assistant message wrapping a single tool part.
const toolMsg = (part, turnId = TURN) => ({
  role: 'assistant',
  turnId,
  content: [{ type: 'tool', ...part }],
});

describe('chat-controller _messagesForAgent', () => {
  function agentMessages(messages) {
    const controller = makeController();
    controller._messages = messages;
    return controller._messagesForAgent();
  }

  it('passes plain messages through unchanged', () => {
    const msgs = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    expect(agentMessages(msgs)).to.deep.equal(msgs);
  });

  it('keeps current-turn tool parts', () => {
    const msgs = [
      { role: 'user', content: 'go' },
      toolMsg({ toolCallId: 'r1', toolName: 'content_read', input: { path: '/x' }, state: TOOL_STATE.OUTPUT_AVAILABLE, output: {} }),
    ];
    expect(agentMessages(msgs)).to.deep.equal(msgs);
  });

  it('drops prior-turn non-gated tool reads to keep the payload bounded', () => {
    const result = agentMessages([
      toolMsg({ toolCallId: 'old', toolName: 'content_read', input: {}, state: TOOL_STATE.OUTPUT_AVAILABLE, output: {} }, OTHER_TURN),
      { role: 'user', content: 'new question' },
      toolMsg({ toolCallId: 'new', toolName: 'content_read', input: {}, state: TOOL_STATE.OUTPUT_AVAILABLE, output: {} }, TURN),
    ]);
    const ids = result
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((p) => p.type === 'tool')
      .map((p) => p.toolCallId);
    expect(ids).to.deep.equal(['new']); // 'old' dropped
  });

  it('keeps prior-turn approval-gated tool parts (record of destructive actions)', () => {
    const result = agentMessages([
      toolMsg({
        toolCallId: 'w1', toolName: 'content_create', input: {}, state: TOOL_STATE.OUTPUT_AVAILABLE, output: {}, approvalRequired: true,
      }, OTHER_TURN),
      { role: 'user', content: 'next' },
    ]);
    const ids = result
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((p) => p.type === 'tool')
      .map((p) => p.toolCallId);
    expect(ids).to.deep.equal(['w1']); // gated part retained across turns
  });
});

describe('chat-controller _onToolEvent', () => {
  it('creates an in-flight tool part on tool-input-available', () => {
    const c = makeController();
    c._onToolEvent({ type: 'tool-input-available', toolCallId: 't1', toolName: 'content_create', input: { path: '/a' } });
    const card = c._deriveToolCards().get('t1');
    expect(card.state).to.equal(TOOL_STATE.INPUT_AVAILABLE);
    expect(card.toolName).to.equal('content_create');
  });

  it('moves a part to awaiting-approval on tool-approval-request', () => {
    const c = makeController();
    c._onToolEvent({ type: 'tool-input-available', toolCallId: 't1', toolName: 'content_create', input: {} });
    c._onToolEvent({ type: 'tool-approval-request', toolCallId: 't1' });
    expect(c._deriveToolCards().get('t1').state).to.equal(TOOL_STATE.AWAITING_APPROVAL);
  });

  it('auto-approves an approval request for an always-approved tool', () => {
    const c = makeController();
    c._autoApprovedTools = new Set(['content_create']);
    c._onToolEvent({ type: 'tool-input-available', toolCallId: 't1', toolName: 'content_create', input: {} });
    c._onToolEvent({ type: 'tool-approval-request', toolCallId: 't1' });
    expect(c._deriveToolCards().get('t1').state).to.equal(TOOL_STATE.APPROVED);
  });

  it('settles a part on tool-output-available', () => {
    const c = makeController();
    c._onToolEvent({ type: 'tool-input-available', toolCallId: 't1', toolName: 'content_read', input: {} });
    c._onToolEvent({ type: 'tool-output-available', toolCallId: 't1', output: { ok: true } });
    const card = c._deriveToolCards().get('t1');
    expect(card.state).to.equal(TOOL_STATE.OUTPUT_AVAILABLE);
    expect(card.output).to.deep.equal({ ok: true });
  });
});

describe('chat-controller approveToolCall (batching)', () => {
  // Seed two gated tool parts awaiting approval and stub the network round.
  function seedTwoAwaiting() {
    const c = makeController();
    const streamCalls = [];
    c._connected = true;
    c._stream = async (pc) => { streamCalls.push(pc); };
    c._messages = [
      toolMsg({ toolCallId: 'a', toolName: 'content_create', input: {}, state: TOOL_STATE.AWAITING_APPROVAL, approvalRequired: true }),
      toolMsg({ toolCallId: 'b', toolName: 'content_create', input: {}, state: TOOL_STATE.AWAITING_APPROVAL, approvalRequired: true }),
    ];
    return { c, streamCalls };
  }

  it('does not POST until the whole queue is drained, then POSTs once', async () => {
    const { c, streamCalls } = seedTwoAwaiting();

    await c.approveToolCall('a', true);
    expect(streamCalls).to.have.lengthOf(0); // 'b' still awaiting
    expect(c._deriveToolCards().get('a').state).to.equal(TOOL_STATE.APPROVED);

    await c.approveToolCall('b', true);
    expect(streamCalls).to.have.lengthOf(1); // single batched POST
    expect(c._deriveToolCards().get('b').state).to.equal(TOOL_STATE.APPROVED);
  });

  it('marks the batch as sent so it cannot resend', async () => {
    const { c } = seedTwoAwaiting();
    await c.approveToolCall('a', true);
    await c.approveToolCall('b', true);
    expect([...c._sentToolCallIds].sort()).to.deep.equal(['a', 'b']);
    expect(c._pendingUnsent()).to.have.lengthOf(0);
  });

  it('"always approve" drains the rest of the same-tool queue and POSTs once', async () => {
    const { c, streamCalls } = seedTwoAwaiting();
    await c.approveToolCall('a', true, true);
    expect(c._deriveToolCards().get('b').state).to.equal(TOOL_STATE.APPROVED);
    expect(c._autoApprovedTools.has('content_create')).to.equal(true);
    expect(streamCalls).to.have.lengthOf(1);
  });

  it('reject-all still POSTs once so the agent can respond', async () => {
    const { c, streamCalls } = seedTwoAwaiting();
    await c.approveToolCall('a', false);
    expect(streamCalls).to.have.lengthOf(0); // 'b' still awaiting
    await c.approveToolCall('b', false);
    expect(streamCalls).to.have.lengthOf(1);
    expect(c._deriveToolCards().get('a').state).to.equal(TOOL_STATE.REJECTED);
    expect(c._deriveToolCards().get('b').state).to.equal(TOOL_STATE.REJECTED);
  });
});

describe('chat-controller migrateHistory (v1 → v2)', () => {
  it('collapses a v1 tool-call + role:tool tool-result into a v2 tool part', () => {
    const out = migrateHistory([
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'r1', toolName: 'content_read', input: { path: '/x' } }],
      },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'r1', output: { type: 'json', value: { ok: true } } }] },
    ]);
    expect(out).to.have.lengthOf(1);
    expect(out[0].content[0]).to.deep.include({
      type: 'tool', toolCallId: 'r1', toolName: 'content_read', state: TOOL_STATE.OUTPUT_AVAILABLE,
    });
    expect(out[0].content[0].output).to.deep.equal({ ok: true });
  });

  it('migrates a v1 virtual read using its stored toolResult', () => {
    const out = migrateHistory([
      {
        role: 'assistant',
        virtual: true,
        turnId: TURN,
        toolResult: { output: 'plain' },
        content: [{ type: 'tool-call', toolCallId: 'r1', toolName: 'content_read', input: {} }],
      },
    ]);
    expect(out[0].content[0].state).to.equal(TOOL_STATE.OUTPUT_AVAILABLE);
    expect(out[0].content[0].output).to.equal('plain');
    expect(out[0].virtual).to.equal(undefined);
  });

  it('drops unresolved v1 tool-calls and approval artifacts', () => {
    const out = migrateHistory([
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 'w1', toolName: 'content_create', input: {} },
          { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'w1' },
        ],
      },
      { role: 'tool', content: [{ type: 'tool-approval-response', approvalId: 'a1', approved: true }] },
    ]);
    expect(out).to.deep.equal([]); // nothing resolved → all dropped
  });

  it('passes plain text messages through', () => {
    const msgs = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    expect(migrateHistory(msgs)).to.deep.equal(msgs);
  });
});

describe('chat-controller _pageContextForAgent', () => {
  it('includes the browser IANA time zone alongside org/site/path/view', () => {
    const controller = new ChatController({ onUpdate() {}, onToolDone() {} });
    controller.setContext({ org: 'adobe', site: 'da-nx', path: '/foo', view: 'edit' });
    const result = controller._pageContextForAgent();
    expect(result.timeZone).to.equal(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(result).to.deep.equal({
      org: 'adobe', site: 'da-nx', path: '/foo', view: 'edit', timeZone: result.timeZone,
    });
  });

  it('returns undefined when org/site are missing, same as before', () => {
    const controller = new ChatController({ onUpdate() {}, onToolDone() {} });
    controller.setContext({ path: '/foo' });
    expect(controller._pageContextForAgent()).to.equal(undefined);
  });
});

describe('chat-controller continuation gate', () => {
  const EVALUATE_PAGE = `mcp__mock-server__${TOOL_NAME.EVALUATE_PAGE}`;

  // Drive a tool through to a completed (output-available) part, as the stream would.
  function runToolToDone(controller, toolCallId, output = {}, toolName = EVALUATE_PAGE) {
    controller._onToolEvent({
      type: 'tool-input-available', toolCallId, toolName, input: { url: 'x' },
    });
    controller._onToolEvent({
      type: 'tool-output-available', toolCallId, toolName, output,
    });
  }

  it('flags a completed tool card as continuationPending without pushing to _messages', () => {
    const controller = makeController();
    runToolToDone(controller, 't1', { brand_name: 'X' });
    const before = controller._messages.length;
    controller._onToolEvent({
      type: 'data-continuation', toolCallId: 't1', toolName: EVALUATE_PAGE,
    });
    const card = controller._deriveToolCards().get('t1');
    expect(card.continuationPending).to.equal(true);
    expect(card.state).to.equal(TOOL_STATE.OUTPUT_AVAILABLE); // still shows its result
    expect(controller._messages.length).to.equal(before); // the gate persists nothing
  });

  it('ignores a continuation event for an unknown tool call', () => {
    const controller = makeController();
    controller._onToolEvent({ type: 'data-continuation', toolCallId: 'nope' });
    expect(controller._deriveToolCards().has('nope')).to.equal(false);
    expect(controller._continuationPendingIds?.has('nope') ?? false).to.equal(false);
  });

  it('continueExecution clears the flag and re-streams', async () => {
    const controller = makeController();
    runToolToDone(controller, 't1');
    controller._onToolEvent({ type: 'data-continuation', toolCallId: 't1', toolName: EVALUATE_PAGE });
    controller._pageContextForAgent = () => ({});
    let streamed = 0;
    controller._stream = async () => { streamed += 1; };
    await controller.continueExecution();
    expect(streamed).to.equal(1);
    expect(controller._deriveToolCards().get('t1').continuationPending).to.equal(false);
  });

  it('stopExecution records a user message and does not re-stream', async () => {
    const controller = makeController();
    controller._getRoom = async () => 'room';
    runToolToDone(controller, 't1');
    controller._onToolEvent({ type: 'data-continuation', toolCallId: 't1', toolName: EVALUATE_PAGE });
    let streamed = false;
    controller._stream = async () => { streamed = true; };
    await controller.stopExecution();
    expect(controller._messages.at(-1)).to.deep.equal(
      { role: 'user', content: 'User decided not to continue further.' },
    );
    expect(controller._deriveToolCards().get('t1').continuationPending).to.equal(false);
    expect(streamed).to.equal(false);
  });
});

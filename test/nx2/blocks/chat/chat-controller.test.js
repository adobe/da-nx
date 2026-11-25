import { expect } from '@esm-bundle/chai';
import ChatController, { migrateHistory } from '../../../../nx2/blocks/chat/chat-controller.js';
import { TOOL_STATE } from '../../../../nx2/blocks/chat/constants.js';
import ChatBackend from '../../../../nx2/blocks/chat/chat-backend.js';

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

describe('chat-controller turn completion', () => {
  function setup() {
    const completed = [];
    const controller = new ChatController({
      onUpdate() {},
      onTurnCompleted: (detail) => completed.push(detail),
    });
    controller._messages = [];
    controller._connected = true;
    controller.setContext({ org: 'org', site: 'site', path: 'page' });
    return { controller, completed };
  }

  it('notifies after the whole response', async () => {
    const { controller, completed } = setup();
    controller._stream = async () => {
      expect(completed).to.have.lengthOf(0);
    };
    await controller.sendMessage('hello');
    expect(completed).to.deep.equal([{
      org: 'org',
      site: 'site',
      path: 'page',
      sessionId: controller._sessionId,
      turnId: controller._currentTurnId,
      status: 'completed',
    }]);
  });

  it('does not finish at an approval pause, then finishes after the continuation', async () => {
    const { controller, completed } = setup();
    controller._stream = async () => {
      controller._messages.push(toolMsg({
        toolCallId: 'write',
        toolName: 'content_create',
        input: {},
        state: TOOL_STATE.AWAITING_APPROVAL,
      }, controller._currentTurnId));
    };
    await controller.sendMessage('write');
    expect(completed).to.have.lengthOf(0);
    controller._stream = async () => {};
    await controller.approveToolCall('write', true);
    expect(completed.map(({ status }) => status)).to.deep.equal(['completed']);
  });

  it('reports an error once rather than completing again in finally', async () => {
    const { controller, completed } = setup();
    controller._stream = async () => { throw new Error('offline'); };
    await controller.sendMessage('hello');
    expect(completed.map(({ status }) => status)).to.deep.equal(['error']);
  });

  it('notifies when a restored approval finishes', async () => {
    const { controller, completed } = setup();
    controller._messages = [toolMsg({
      toolCallId: 'restored',
      toolName: 'content_create',
      input: {},
      state: TOOL_STATE.AWAITING_APPROVAL,
    }, OTHER_TURN)];
    controller._stream = async () => {};
    await controller.approveToolCall('restored', true);
    expect(completed).to.have.lengthOf(1);
    expect(completed[0].status).to.equal('completed');
  });

  it('reports cancellation without suppressing subsequent notifications', async () => {
    const { controller, completed } = setup();
    let finish;
    controller._stream = () => new Promise((resolve) => { finish = resolve; });
    const pending = controller.sendMessage('hello');
    controller.stop();
    expect(completed[0].status).to.equal('aborted');
    finish();
    await pending;
    expect(completed.map(({ status }) => status)).to.deep.equal(['aborted', 'completed']);
  });
});

describe('chat-controller turn activity', () => {
  function setup() {
    const started = [];
    const progress = [];
    const controller = new ChatController({
      onUpdate() {},
      onTurnStarted: (detail) => started.push(detail),
      onTurnProgress: (detail) => progress.push(detail),
    });
    controller._messages = [];
    controller._connected = true;
    controller.setContext({ org: 'org', site: 'site', path: 'page' });
    return { controller, started, progress };
  }

  const toolEvent = (controller, type, toolCallId, extra = {}) => controller._onToolEvent({
    type, toolCallId, ...extra,
  });

  it('traces adapter, HTTP stream, tool summary and completion in execution order', async () => {
    const originalHref = window.location.href;
    const originalLog = console.log;
    const originalFetch = window.fetch;
    const logs = [];
    const secret = 'private-prompt-and-tool-content';
    const url = new URL(originalHref);
    url.searchParams.set('chat-trace', 'true');
    window.history.replaceState(window.history.state, '', url.href);
    console.log = (...args) => logs.push(args);
    window.fetch = async () => new Response([
      { type: 'tool-input-available', toolCallId: 'trace', toolName: 'content_update', input: { path: '/a', content: secret } },
      { type: 'tool-output-available', toolCallId: 'trace', output: { content: secret } },
      { type: 'finish' },
    ].map((event) => `data: ${JSON.stringify(event)}\n`).join(''));
    try {
      const backend = new ChatBackend({ onUpdate() {}, onToolDone() {} });
      const controller = backend._controller;
      controller._messages = [];
      controller._connected = true;
      controller._getRoom = async () => 'trace-test-room';
      controller.setContext({ org: 'org', site: 'site', path: '/page' });
      await backend.sendMessage(secret);
      const labels = logs.map(([label]) => label);
      const index = (step) => labels.findIndex((label) => label.includes(step));
      const steps = [
        'chat-backend.js.sendMessage',
        'chat-controller.js.sendMessage: calling onTurnStarted',
        'chat-controller.js._stream: sending HTTP POST',
        'stream.js.readStream: reading',
        'stream.js.processEvent: routing',
        'chat-controller.js._onToolEvent',
        'chat-controller.js._done: calling onTurnCompleted',
      ].map(index);
      expect(steps.every((position) => position >= 0)).to.equal(true);
      expect(steps).to.deep.equal([...steps].sort((a, b) => a - b));
      expect(JSON.stringify(logs)).not.to.include(secret);
    } finally {
      window.fetch = originalFetch;
      console.log = originalLog;
      window.history.replaceState(window.history.state, '', originalHref);
    }
  });

  it('announces the turn before the request is sent', async () => {
    const { controller, started } = setup();
    controller._stream = async () => {
      expect(started).to.deep.equal([{
        org: 'org',
        site: 'site',
        path: 'page',
        sessionId: controller._sessionId,
        turnId: controller._currentTurnId,
      }]);
    };
    await controller.sendMessage('update pages');
    expect(started).to.have.lengthOf(1);
  });

  it('reports each page and its status as tool calls run', async () => {
    const { controller, progress } = setup();
    controller._stream = async () => {
      toolEvent(controller, 'tool-input-available', 'list', { toolName: 'content_list', input: { path: '/' } });
      toolEvent(controller, 'tool-input-available', 'a', { toolName: 'content_update', input: { path: '/a' } });
      toolEvent(controller, 'tool-input-available', 'b', { toolName: 'content_update', input: { path: '/b' } });
      toolEvent(controller, 'tool-output-available', 'a', { output: {} });
      toolEvent(controller, 'tool-output-error', 'b', { errorText: 'nope' });
    };
    await controller.sendMessage('update pages');
    expect(progress.map(({ pages }) => pages)).to.deep.equal([
      [],
      [{ path: '/a', status: 'working' }],
      [{ path: '/a', status: 'working' }, { path: '/b', status: 'working' }],
      [{ path: '/a', status: 'done' }, { path: '/b', status: 'working' }],
      [{ path: '/a', status: 'done' }, { path: '/b', status: 'failed' }],
    ]);
    expect(progress[0].turnId).to.equal(controller._currentTurnId);
  });

  it('reports pages awaiting approval, then the approved result', async () => {
    const { controller, progress } = setup();
    controller._stream = async () => {
      toolEvent(controller, 'tool-input-available', 'a', { toolName: 'content_create', input: { path: '/a' } });
      toolEvent(controller, 'tool-approval-request', 'a');
    };
    await controller.sendMessage('create a page');
    expect(progress.at(-1).pages).to.deep.equal([{ path: '/a', status: 'needs-approval' }]);
    controller._stream = async () => {
      toolEvent(controller, 'tool-output-available', 'a', { output: {} });
    };
    await controller.approveToolCall('a', true);
    expect(progress.at(-1).pages).to.deep.equal([{ path: '/a', status: 'done' }]);
  });

  it('ignores earlier turns and restored history', async () => {
    const { controller, progress } = setup();
    controller._messages = [toolMsg({
      toolCallId: 'old', toolName: 'content_update', input: { path: '/old' }, state: TOOL_STATE.OUTPUT_AVAILABLE,
    }, OTHER_TURN)];
    controller._update();
    expect(progress).to.have.lengthOf(0);
    controller._stream = async () => {};
    await controller.sendMessage('hello');
    expect(progress.map(({ pages }) => pages)).to.deep.equal([[]]);
  });
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

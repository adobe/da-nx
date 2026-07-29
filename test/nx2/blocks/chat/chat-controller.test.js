import { expect } from '@esm-bundle/chai';
import ChatController, {
  stripOrphanedToolCallMessages,
  reconstructToolCards,
} from '../../../../nx2/blocks/chat/chat-controller.js';
import { TOOL_NAME } from '../../../../nx2/blocks/chat/constants.js';

const TURN = 'turn-current';
const OTHER_TURN = 'turn-previous';

// Build a controller with a known message history and current turn, then read back
// what would actually be POSTed to the (stateless) agent.
function agentMessages(messages, currentTurnId = TURN) {
  const controller = new ChatController({ onUpdate() {}, onToolDone() {} });
  controller._messages = messages;
  controller._currentTurnId = currentTurnId;
  return controller._messagesForAgent();
}

// A completed non-approval tool call (e.g. content_read) as the UI stores it.
const virtualRead = (toolCallId, turnId, output) => ({
  role: 'assistant',
  virtual: true,
  turnId,
  toolResult: { output },
  content: [{ type: 'tool-call', toolCallId, toolName: 'content_read', input: { path: '/x' } }],
});

describe('chat-controller _messagesForAgent', () => {
  it('passes non-virtual messages through unchanged', () => {
    const msgs = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    expect(agentMessages(msgs)).to.deep.equal(msgs);
  });

  it('replays a current-turn content_read as a paired tool-call + tool-result', () => {
    const output = { content: '<p>surf</p>', blocks: [{ locator: 'abc' }] };
    const result = agentMessages([
      { role: 'user', content: 'add fishing para' },
      virtualRead('r1', TURN, output),
    ]);

    expect(result).to.have.lengthOf(3);
    expect(result[0]).to.deep.equal({ role: 'user', content: 'add fishing para' });
    expect(result[1]).to.deep.equal({
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: 'r1', toolName: 'content_read', input: { path: '/x' } }],
    });
    expect(result[2]).to.deep.equal({
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: 'r1', toolName: 'content_read', output: { type: 'json', value: output } }],
    });
  });

  it('wraps a string tool output as a text part', () => {
    const result = agentMessages([virtualRead('r1', TURN, 'plain text')]);
    expect(result[1].content[0].output).to.deep.equal({ type: 'text', value: 'plain text' });
  });

  it('drops tool I/O from previous turns to keep the payload bounded', () => {
    const result = agentMessages([
      virtualRead('old', OTHER_TURN, { content: 'stale' }),
      { role: 'user', content: 'new question' },
      virtualRead('new', TURN, { content: 'fresh' }),
    ]);
    const readIds = result
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((p) => p.type === 'tool-call')
      .map((p) => p.toolCallId);
    expect(readIds).to.deep.equal(['new']); // 'old' dropped
  });

  it('drops the virtual twin of an approval tool already represented by a real tool-call', () => {
    const result = agentMessages([
      // Real (non-virtual) approval message for content_replace.
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 'w1', toolName: 'content_replace', input: {} },
          { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'w1' },
        ],
      },
      { role: 'tool', content: [{ type: 'tool-approval-response', approvalId: 'a1', approved: true }] },
      // Virtual DONE twin for the same call — must NOT be re-sent (would duplicate w1).
      {
        role: 'assistant',
        virtual: true,
        turnId: TURN,
        toolResult: { output: { updated: true } },
        content: [{ type: 'tool-call', toolCallId: 'w1', toolName: 'content_replace', input: {} }],
      },
    ]);

    const w1Calls = result
      .filter((m) => m.role === 'assistant' && Array.isArray(m.content))
      .flatMap((m) => m.content)
      .filter((p) => p.type === 'tool-call' && p.toolCallId === 'w1');
    expect(w1Calls).to.have.lengthOf(1); // exactly one, from the real approval message
  });

  it('skips a current-turn virtual message that has no stored output', () => {
    const result = agentMessages([
      { role: 'assistant', virtual: true, turnId: TURN, content: [{ type: 'tool-call', toolCallId: 'r1', toolName: 'content_read', input: {} }] },
    ]);
    expect(result).to.deep.equal([]); // no orphan tool-call emitted
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

describe('chat-controller reload persistence (cards survive refresh)', () => {
  const virtualMockTool = (toolCallId, output) => ({
    role: 'assistant',
    virtual: true,
    turnId: 't',
    toolResult: { output },
    content: [{
      type: 'tool-call', toolCallId, toolName: 'mock_tool', input: { url: 'x' },
    }],
  });

  it('keeps a self-resolved virtual tool card (result stored inline, no role:tool message)', () => {
    const msgs = [
      { role: 'user', content: 'evaluate the page' },
      virtualMockTool('t1', { brand_name: 'X' }),
    ];
    const kept = stripOrphanedToolCallMessages(msgs);
    expect(kept).to.have.lengthOf(2); // the virtual card message is NOT stripped
  });

  it('still strips a virtual message with no stored result (incomplete run)', () => {
    const running = {
      role: 'assistant',
      virtual: true,
      turnId: 't',
      content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'mock_tool', input: {} }],
    };
    const kept = stripOrphanedToolCallMessages([{ role: 'user', content: 'hi' }, running]);
    expect(kept).to.deep.equal([{ role: 'user', content: 'hi' }]);
  });

  it('reconstructs a tool card with its stored output and DONE state', () => {
    const cards = reconstructToolCards([virtualMockTool('t1', { brand_name: 'X' })]);
    expect(cards.get('t1')).to.deep.equal({
      toolName: 'mock_tool',
      input: { url: 'x' },
      output: { brand_name: 'X' },
      state: 'done',
    });
  });

  it('reconstructs an errored tool card with ERROR state', () => {
    const cards = reconstructToolCards([virtualMockTool('t1', { error: 'nope' })]);
    expect(cards.get('t1').state).to.equal('error');
    expect(cards.get('t1').output).to.deep.equal({ error: 'nope' });
  });
});

describe('chat-controller continuation gate', () => {
  function makeController() {
    const controller = new ChatController({ onUpdate() {}, onToolDone() {} });
    controller._messages = [];
    controller._toolCards = new Map();
    return controller;
  }

  it('flags a DONE tool card as continuationPending without pushing to _messages', () => {
    const controller = makeController();
    controller._toolCards.set('t1', {
      toolName: 'mock_tool', state: 'done', output: {},
    });
    controller._onToolEvent({
      type: 'data-continuation', toolCallId: 't1', toolName: 'mock_tool',
    });
    expect(controller._toolCards.get('t1').continuationPending).to.equal(true);
    expect(controller._toolCards.get('t1').state).to.equal('done'); // still shows its result
    expect(controller._messages).to.deep.equal([]);
  });

  it('ignores a continuation event for an unknown tool card', () => {
    const controller = makeController();
    controller._onToolEvent({ type: 'data-continuation', toolCallId: 'nope' });
    expect(controller._toolCards.has('nope')).to.equal(false);
  });

  it('creates a message at tool-call time for evaluate_page so its loading card renders', () => {
    const controller = makeController();
    controller._onToolEvent({
      type: 'tool-call', toolCallId: 't1', toolName: `mcp__mock-server__${TOOL_NAME.EVALUATE_PAGE}`, input: { url: 'x' },
    });
    const running = controller._messages.filter(
      (m) => Array.isArray(m.content)
        && m.content.some((p) => p.type === 'tool-call' && p.toolCallId === 't1'),
    );
    expect(running).to.have.lengthOf(1); // message exists → renderToolCard shows loading
    expect(controller._toolCards.get('t1').state).to.equal('running');
  });

  it('updates the running evaluate_page message in place on result (no duplicate card)', () => {
    const controller = makeController();
    controller._onToolEvent({
      type: 'tool-call', toolCallId: 't1', toolName: `mcp__mock-server__${TOOL_NAME.EVALUATE_PAGE}`, input: { url: 'x' },
    });
    controller._onToolEvent({
      type: 'tool-result', toolCallId: 't1', toolName: `mcp__mock-server__${TOOL_NAME.EVALUATE_PAGE}`, output: { brand_name: 'X' },
    });
    const msgs = controller._messages.filter(
      (m) => Array.isArray(m.content)
        && m.content.some((p) => p.type === 'tool-call' && p.toolCallId === 't1'),
    );
    expect(msgs).to.have.lengthOf(1); // updated in place, not duplicated
    expect(msgs[0].toolResult).to.deep.equal({ output: { brand_name: 'X' } });
    expect(controller._toolCards.get('t1').state).to.equal('done');
  });

  it('does not pre-create a message for a running non-loading tool', () => {
    const controller = makeController();
    controller._onToolEvent({
      type: 'tool-call', toolCallId: 'r1', toolName: 'content_read', input: { path: '/x' },
    });
    expect(controller._messages).to.deep.equal([]); // unchanged behavior for generic tools
  });

  it('renders a card for an errored tool result (creates a message, not just a Map entry)', () => {
    const controller = makeController();
    controller._onToolEvent({
      type: 'tool-call', toolCallId: 't1', toolName: 'mock_tool', input: { url: 'x' },
    });
    controller._onToolEvent({
      type: 'tool-result', toolCallId: 't1', toolName: 'mock_tool', output: { error: 'boom' }, isError: true,
    });
    // renderToolCard only fires for tool-call parts in _messages, so an error must
    // produce a message — otherwise the failed tool's result never renders.
    const rendered = controller._messages.some(
      (m) => Array.isArray(m.content)
        && m.content.some((p) => p.type === 'tool-call' && p.toolCallId === 't1'),
    );
    expect(rendered).to.equal(true);
    expect(controller._toolCards.get('t1').state).to.equal('error');
    expect(controller._toolCards.get('t1').output).to.deep.equal({ error: 'boom' });
  });

  it('continueExecution clears the flag and re-streams', async () => {
    const controller = makeController();
    controller._toolCards.set('t1', { toolName: 'x', state: 'done', continuationPending: true });
    controller._pageContextForAgent = () => ({});
    let streamed = 0;
    controller._stream = async () => { streamed += 1; };
    await controller.continueExecution();
    expect(streamed).to.equal(1);
    expect(controller._toolCards.get('t1').continuationPending).to.equal(false);
  });

  it('stopExecution records a user message and does not re-stream', async () => {
    const controller = makeController();
    controller._getRoom = async () => 'room';
    controller._toolCards.set('t1', { toolName: 'x', state: 'done', continuationPending: true });
    let streamed = false;
    controller._stream = async () => { streamed = true; };
    await controller.stopExecution();
    expect(controller._messages).to.deep.equal([
      { role: 'user', content: 'User decided not to continue further.' },
    ]);
    expect(controller._toolCards.get('t1').continuationPending).to.equal(false);
    expect(streamed).to.equal(false);
  });
});

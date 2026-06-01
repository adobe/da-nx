import { expect } from '@esm-bundle/chai';
import ChatController from '../../../../nx2/blocks/chat/chat-controller.js';

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

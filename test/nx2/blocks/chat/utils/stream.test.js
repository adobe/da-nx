import { expect } from '@esm-bundle/chai';
import { readStream } from '../../../../../nx2/blocks/chat/utils/stream.js';

// Build a streaming body (async iterable of Uint8Array) from newline-delimited
// `data: <json>` lines, matching the SSE-style format da-agent emits.
function bodyFrom(events) {
  const encoder = new TextEncoder();
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n`).join('');
  return (async function* gen() {
    yield encoder.encode(text);
  }());
}

describe('readStream — data-continuation', () => {
  it('forwards a transient data-continuation part to onTool', async () => {
    const events = [];
    await readStream(
      bodyFrom([
        {
          type: 'data-continuation',
          transient: true,
          data: { toolCallId: 't1', toolName: 'mcp__mock-server__mock_tool' },
        },
        { type: 'finish' },
      ]),
      { onDelta() {}, onText() {}, onTool: (e) => events.push(e) },
    );

    expect(events).to.deep.equal([
      {
        type: 'data-continuation',
        toolCallId: 't1',
        toolName: 'mcp__mock-server__mock_tool',
      },
    ]);
  });
});

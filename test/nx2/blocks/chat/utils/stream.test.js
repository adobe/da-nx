import { expect } from '@esm-bundle/chai';
import { readStream } from '../../../../../nx2/blocks/chat/utils/stream.js';

async function* makeBody(...chunks) {
  const enc = new TextEncoder();
  for (const chunk of chunks) {
    yield enc.encode(chunk);
  }
}

describe('readStream', () => {
  it('reassembles a JSON event split across two chunks', async () => {
    // The buffer management splits on \n and holds the tail — a line broken
    // at a chunk boundary must be completed by the next chunk before parsing.
    const body = makeBody(
      'data: {"type":"text-delta","delta":"hel',
      'lo"}\n\n',
    );
    const deltas = [];
    await readStream(body, { onDelta: (t) => deltas.push(t) });
    expect(deltas).to.deep.equal(['hello']);
  });

  it('does not process events from chunks that arrive after a finish event', async () => {
    // Once finished=true the outer for-await breaks on its next iteration,
    // so a delta in a subsequent chunk must never reach onDelta.
    const body = makeBody(
      'data: {"type":"finish","finishReason":"stop"}\n\n',
      'data: {"type":"text-delta","delta":"ghost"}\n\n',
    );
    const deltas = [];
    await readStream(body, { onDelta: (t) => deltas.push(t) });
    expect(deltas).to.have.lengthOf(0);
  });

  it('flushes uncommitted streaming text via onText when the stream ends without TEXT_END', async () => {
    // If the connection drops after text-delta events but before text-end,
    // readStream must still commit what it accumulated rather than silently dropping it.
    const body = makeBody('data: {"type":"text-delta","delta":"partial"}\n\n');
    let committed = null;
    await readStream(body, {
      onDelta: () => {},
      onText: (t) => { committed = t; },
    });
    expect(committed).to.equal('partial');
  });
});

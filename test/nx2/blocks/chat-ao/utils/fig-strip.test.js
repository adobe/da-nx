import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

import {
  parseFig,
  stripFig,
  summarizeFigForAgent,
} from '../../../../../nx2/blocks/chat-ao/utils/fig-strip.js';

// Builds a minimal, valid store-method ZIP (no compression, no real CRC —
// stripFig never validates either) so tests don't need a real multi-hundred-KB
// .fig export as a fixture. Include an entry outside stripFig's KEEP list
// (e.g. "images/x") to exercise the actual size reduction.
function buildTestZip(entries) {
  const enc = new TextEncoder();
  const localChunks = [];
  const centralMeta = [];
  let offset = 0;

  entries.forEach(({ name, bytes }) => {
    const nameBytes = enc.encode(name);
    const header = new Uint8Array(30 + nameBytes.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x04034b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(8, 0, true); // method: store
    hv.setUint32(18, bytes.length, true); // compSize
    hv.setUint32(22, bytes.length, true); // uncompSize
    hv.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);

    localChunks.push(header, bytes);
    centralMeta.push({ nameBytes, size: bytes.length, offset });
    offset += header.length + bytes.length;
  });

  const cdStart = offset;
  const centralChunks = centralMeta.map((e) => {
    const rec = new Uint8Array(46 + e.nameBytes.length);
    const rv = new DataView(rec.buffer);
    rv.setUint32(0, 0x02014b50, true);
    rv.setUint16(4, 20, true);
    rv.setUint16(6, 20, true);
    rv.setUint32(20, e.size, true);
    rv.setUint32(24, e.size, true);
    rv.setUint16(28, e.nameBytes.length, true);
    rv.setUint32(42, e.offset, true);
    rec.set(e.nameBytes, 46);
    return rec;
  });
  const cdSize = centralChunks.reduce((n, c) => n + c.length, 0);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centralMeta.length, true);
  ev.setUint16(10, centralMeta.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);

  const all = [...localChunks, ...centralChunks, eocd];
  const total = all.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  all.forEach((c) => {
    out.set(c, cursor);
    cursor += c.length;
  });
  return out;
}

describe('fig-strip.js', () => {
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub(window, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('POSTs the bytes to <fig-inspector>/inspect and returns the parsed JSON', async () => {
    const parsed = { file_name: 'Test.fig', text: ['hello'], images: [] };
    fetchStub.resolves(new Response(JSON.stringify(parsed), { status: 200 }));

    const bytes = new Uint8Array([1, 2, 3]);
    const result = await parseFig(bytes);

    expect(result).to.deep.equal(parsed);
    const [url, opts] = fetchStub.firstCall.args;
    expect(url).to.include('/inspect');
    expect(opts.method).to.equal('POST');
    expect(opts.body).to.equal(bytes);
  });

  it('throws with the response status and body text on a non-ok response', async () => {
    fetchStub.resolves(new Response('bad request', { status: 400 }));

    let caught;
    try {
      await parseFig(new Uint8Array([1]));
    } catch (err) {
      caught = err;
    }

    expect(caught).to.be.an('error');
    expect(caught.message).to.include('400');
    expect(caught.message).to.include('bad request');
  });

  it('keeps stripped .fig payloads a valid, smaller ZIP', () => {
    const enc = new TextEncoder();
    const zip = buildTestZip([
      { name: 'canvas.fig', bytes: enc.encode('{"canvas":true}') },
      { name: 'thumbnail.png', bytes: enc.encode('fake-png-bytes') },
      { name: 'meta.json', bytes: enc.encode('{"meta":true}') },
      { name: 'images/deadbeef', bytes: new Uint8Array(1000) },
    ]);

    const stripped = stripFig(zip.buffer);

    expect(stripped.byteLength).to.be.lessThan(zip.byteLength);
  });

  it('summarizeFigForAgent renders the file name header', () => {
    const parsed = { file_name: 'Test.fig', text: ['Hello world'], images: [] };
    expect(summarizeFigForAgent(parsed)).to.include('[Parsed Figma design: Test.fig]');
  });
});

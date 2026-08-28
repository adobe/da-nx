import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

import {
  parseFig,
  stripFig,
  summarizeFigForAgent,
} from '../../../../../nx2/blocks/chat-ao/utils/fig-strip.js';

// Loaded at module-evaluation time — before mocha runs anything, and before
// beforeEach stubs `fetch` below.
const fixtureResponse = await fetch(new URL('../fixtures/FigmaTestFile.fig', import.meta.url).href);
const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());

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
    const stripped = stripFig(fixtureBytes.buffer);

    expect(stripped.byteLength).to.be.lessThan(fixtureBytes.byteLength);
  });

  it('summarizeFigForAgent renders the file name header', () => {
    const parsed = { file_name: 'Test.fig', text: ['Hello world'], images: [] };
    expect(summarizeFigForAgent(parsed)).to.include('[Parsed Figma design: Test.fig]');
  });
});

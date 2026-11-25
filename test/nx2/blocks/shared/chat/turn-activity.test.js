import { expect } from '@esm-bundle/chai';
import {
  PAGE_STATUS, summarizePages, toolPaths, traceChat,
} from '../../../../../nx2/blocks/shared/chat/turn-activity.js';

const { WORKING, NEEDS_APPROVAL, FAILED, REJECTED, DONE } = PAGE_STATUS;

describe('turn-activity traceChat', () => {
  let originalHref;
  let originalState;
  let originalLog;
  let logs;

  function setTrace(value) {
    const url = new URL(window.location.href);
    url.searchParams.set('chat-trace', value);
    window.history.replaceState(window.history.state, '', url.href);
  }

  beforeEach(() => {
    originalHref = window.location.href;
    originalState = window.history.state;
    originalLog = console.log;
    logs = [];
    console.log = (...args) => logs.push(args);
    setTrace('false');
  });

  afterEach(() => {
    console.log = originalLog;
    window.history.replaceState(originalState, '', originalHref);
  });

  it('does not log unless tracing is explicitly enabled', () => {
    traceChat('test: disabled');
    setTrace('1');
    traceChat('test: not enabled by a truthy value');
    expect(logs).to.have.lengthOf(0);
  });

  it('labels calls with increasing sequence numbers and snapshots metadata', () => {
    setTrace('true');
    const details = { pages: [{ path: '/a', status: WORKING }] };
    traceChat('test: first', details);
    details.pages[0].status = DONE;
    traceChat('test: second', details);
    const firstNumber = Number(logs[0][0].match(/#(\d+)/)[1]);
    const secondNumber = Number(logs[1][0].match(/#(\d+)/)[1]);
    expect(secondNumber).to.equal(firstNumber + 1);
    expect(logs[0][0]).to.equal(`[chat-trace #${firstNumber}] test: first`);
    expect(JSON.parse(logs[0][1])).to.deep.equal({ pages: [{ path: '/a', status: WORKING }] });
    expect(JSON.parse(logs[1][1])).to.deep.equal({ pages: [{ path: '/a', status: DONE }] });
  });

  it('traces path extraction without exposing raw tool arguments', () => {
    setTrace('true');
    const secret = 'private-content-not-for-console';
    const pages = summarizePages([{
      toolName: 'content_update', input: { path: '/a', content: secret }, status: WORKING,
    }]);
    expect(pages).to.deep.equal([{ path: '/a', status: WORKING }]);
    expect(logs.map(([label]) => label)).to.have.lengthOf(4);
    expect(JSON.stringify(logs)).not.to.include(secret);
  });
});

describe('turn-activity toolPaths', () => {
  it('reads path, sourcePath and destinationPath, deduplicated', () => {
    expect(toolPaths('content_update', { path: '/a' })).to.deep.equal(['/a']);
    expect(toolPaths('content_move', { sourcePath: '/a', destinationPath: '/b' }))
      .to.deep.equal(['/a', '/b']);
    expect(toolPaths('content_copy', { sourcePath: '/a', destinationPath: '/a' }))
      .to.deep.equal(['/a']);
  });

  it('parses JSON-string arguments and ignores unparseable ones', () => {
    expect(toolPaths('edit', '{"path":"/a"}')).to.deep.equal(['/a']);
    expect(toolPaths('edit', 'not json')).to.deep.equal([]);
  });

  it('skips folder listings, missing input and blank paths', () => {
    expect(toolPaths('content_list', { path: '/folder' })).to.deep.equal([]);
    expect(toolPaths('list', { path: '/folder' })).to.deep.equal([]);
    expect(toolPaths('content_read', undefined)).to.deep.equal([]);
    expect(toolPaths('content_read', { path: '  ' })).to.deep.equal([]);
  });
});

describe('turn-activity summarizePages', () => {
  it('lists each page once, in first-seen order', () => {
    const pages = summarizePages([
      { toolName: 'content_read', input: { path: '/b' }, status: DONE },
      { toolName: 'content_read', input: { path: '/a' }, status: DONE },
      { toolName: 'content_update', input: { path: '/b' }, status: DONE },
    ]);
    expect(pages).to.deep.equal([{ path: '/b', status: DONE }, { path: '/a', status: DONE }]);
  });

  it('reports the most pressing status across calls on the same page', () => {
    const page = (statuses) => summarizePages(statuses.map((status) => (
      { toolName: 'content_update', input: { path: '/a' }, status }
    )))[0].status;
    expect(page([DONE, WORKING])).to.equal(WORKING);
    expect(page([WORKING, NEEDS_APPROVAL])).to.equal(NEEDS_APPROVAL);
    expect(page([DONE, FAILED])).to.equal(FAILED);
    expect(page([DONE, REJECTED])).to.equal(REJECTED);
    expect(page([FAILED, REJECTED])).to.equal(FAILED);
  });

  it('returns no pages for a turn without page tools', () => {
    expect(summarizePages([])).to.deep.equal([]);
    expect(summarizePages([{ toolName: 'content_list', input: { path: '/' }, status: DONE }]))
      .to.deep.equal([]);
  });
});

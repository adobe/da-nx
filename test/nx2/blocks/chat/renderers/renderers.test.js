import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderMessage } from '../../../../../nx2/blocks/chat/renderers/renderers.js';
import { PART_TYPE, TOOL_STATE } from '../../../../../nx2/blocks/chat/constants.js';

// Render an assistant message and return the mounted container for DOM assertions.
function renderAssistant(content) {
  const host = document.createElement('div');
  render(renderMessage({ role: 'assistant', content }), host);
  return host;
}

// Render a single-tool assistant message through the da-agent tool-card path.
function renderTool(toolCallId, toolCards, opts) {
  const host = document.createElement('div');
  const msg = { role: 'assistant', content: [{ type: PART_TYPE.TOOL, toolCallId }] };
  render(renderMessage(msg, toolCards, opts), host);
  return host;
}

describe('renderers link handling', () => {
  it('linkifies a bare URL in assistant prose', () => {
    const host = renderAssistant('Your page is live at https://main--site--org.aem.live/index now.');
    const link = host.querySelector('.message-content a');
    expect(link).to.exist;
    expect(link.getAttribute('href')).to.equal('https://main--site--org.aem.live/index');
    expect(link.textContent).to.equal('https://main--site--org.aem.live/index');
    expect(link.getAttribute('target')).to.equal('_blank');
    expect(link.getAttribute('rel')).to.equal('noopener noreferrer');
  });

  it('keeps trailing sentence punctuation out of the href', () => {
    const host = renderAssistant('See https://example.com/page.');
    const link = host.querySelector('.message-content a');
    expect(link.getAttribute('href')).to.equal('https://example.com/page');
    expect(host.querySelector('.message-content').textContent).to.contain('https://example.com/page.');
  });

  it('does not absorb a wrapping closing paren into the href', () => {
    const host = renderAssistant('(see https://example.com/docs)');
    const link = host.querySelector('.message-content a');
    expect(link.getAttribute('href')).to.equal('https://example.com/docs');
  });

  it('linkifies multiple bare URLs in a list', () => {
    const host = renderAssistant('- https://a.example.com/x\n- https://b.example.com/y');
    const links = [...host.querySelectorAll('.message-content a')];
    expect(links).to.have.length(2);
    expect(links.map((a) => a.getAttribute('href'))).to.deep.equal([
      'https://a.example.com/x',
      'https://b.example.com/y',
    ]);
  });

  it('still renders standard markdown links', () => {
    const host = renderAssistant('Read the [docs](https://example.com/docs) please.');
    const link = host.querySelector('.message-content a');
    expect(link.getAttribute('href')).to.equal('https://example.com/docs');
    expect(link.textContent).to.equal('docs');
  });

  it('leaves URLs inside inline code as plain text', () => {
    const host = renderAssistant('Call `https://example.com/api` directly.');
    expect(host.querySelector('.message-content code a')).to.equal(null);
    expect(host.querySelector('.message-content code').textContent).to.equal('https://example.com/api');
  });

  it('does not linkify non-http schemes', () => {
    const host = renderAssistant('Reach me at mailto:me@example.com please.');
    expect(host.querySelector('.message-content a')).to.equal(null);
  });
});

describe('renderers da-agent tool cards', () => {
  it('renders exit_plan_mode as a plan card even while awaiting approval', () => {
    const toolCards = new Map([['p1', {
      toolName: 'exit_plan_mode',
      input: { title: 'Launch', tasks: [{ id: '1', label: 'Draft', status: 'pending' }] },
      state: TOOL_STATE.AWAITING_APPROVAL,
    }]]);
    const host = renderTool('p1', toolCards, {});
    const card = host.querySelector('nx-campaign-plan-card');
    expect(card).to.exist;
    expect(card.plan.title).to.equal('Launch');
  });

  it('wires the plan card Run action to approve the exit_plan_mode tool call', () => {
    const approvals = [];
    const toolCards = new Map([['p1', {
      toolName: 'exit_plan_mode',
      input: { title: 'Launch', tasks: [{ id: '1', label: 'Draft', status: 'pending' }] },
      state: TOOL_STATE.AWAITING_APPROVAL,
    }]]);
    const host = renderTool('p1', toolCards, {
      onApprove: (id, approved) => approvals.push([id, approved]),
    });
    const card = host.querySelector('nx-campaign-plan-card');
    card.dispatchEvent(new CustomEvent('nx-plan-run', { bubbles: true, composed: true }));
    expect(approvals).to.deep.equal([['p1', true]]);
  });

  it('merges :::task-item status from streaming text into the plan card', () => {
    const toolCards = new Map([['p1', {
      toolName: 'exit_plan_mode',
      input: { title: 'Launch', tasks: [{ id: '1', label: 'Draft', status: 'pending' }] },
      state: TOOL_STATE.OUTPUT_AVAILABLE,
    }]]);
    const streamingText = ':::task-item\n{"label":"Draft","status":"done"}\n:::';
    const host = renderTool('p1', toolCards, { streamingText });
    expect(host.querySelector('nx-campaign-plan-card').plan.tasks[0].status).to.equal('done');
  });

  it('renders evaluate_page output as a governance-evaluation card', () => {
    const toolCards = new Map([['e1', {
      toolName: 'evaluate_page',
      input: {},
      state: TOOL_STATE.OUTPUT_AVAILABLE,
      output: { status: 'fail', checks: [] },
    }]]);
    const host = renderTool('e1', toolCards, {});
    expect(host.querySelector('nx-governance-evaluation-card')).to.exist;
  });

  it('hides a normal tool card while it awaits approval (approval shown elsewhere)', () => {
    const toolCards = new Map([['c1', {
      toolName: 'content_create',
      input: { path: '/a/b' },
      state: TOOL_STATE.AWAITING_APPROVAL,
    }]]);
    const host = renderTool('c1', toolCards, {});
    expect(host.querySelector('.tool-card')).to.equal(null);
    expect(host.querySelector('nx-campaign-plan-card')).to.equal(null);
  });
});

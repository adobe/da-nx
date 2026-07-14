import { expect } from '@esm-bundle/chai';
import { render, nothing } from 'da-lit';
import { renderMessage, renderApprovalCard } from '../../../../nx2/blocks/chat/renderers.js';
import { DIRECTIVE_TYPE, TOOL_NAME, TOOL_STATE } from '../../../../nx2/blocks/chat/constants.js';

// Import components so custom elements are registered before renderers run.
import '../../../../nx2/blocks/chat/messages/campaign-plan-card.js';
import '../../../../nx2/blocks/chat/messages/preflight-card.js';
import '../../../../nx2/blocks/chat/messages/task-list.js';
import '../../../../nx2/blocks/chat/messages/task-item.js';

// Render a Lit TemplateResult into a real DOM node for inspection.
async function renderToDOM(templateResult) {
  const container = document.createElement('div');
  render(templateResult, container);
  // Allow Lit to flush any pending async updates.
  await 0;
  return container;
}

// Render an assistant message and return the mounted container for DOM assertions.
function renderAssistant(content) {
  const host = document.createElement('div');
  render(renderMessage({ role: 'assistant', content }), host);
  return host;
}

const MOCK_PREFLIGHT = {
  title: 'Cold Coffee Campaign',
  readiness: 94,
  categories: [
    {
      name: 'Context',
      checks: [
        { label: 'Tone of voice & messaging', passed: true },
        { label: 'Logo Usage', passed: true },
      ],
    },
    {
      name: 'SEO',
      checks: [
        { label: 'Title tag present', passed: true },
        { label: 'Meta description', passed: false },
      ],
    },
  ],
  summary: '94% readiness across all checks.',
};

// ─── constants contract ────────────────────────────────────────────────────

describe('DIRECTIVE_TYPE and TOOL_NAME constants', () => {
  it('exports PREFLIGHT directive type', () => {
    expect(DIRECTIVE_TYPE.PREFLIGHT).to.equal('preflight');
  });

  it('exports RUN_PREFLIGHT tool name', () => {
    expect(TOOL_NAME.RUN_PREFLIGHT).to.equal('run_preflight');
  });
});

// ─── renderMessage — :::preflight directive ────────────────────────────────

describe('renderMessage — :::preflight directive', () => {
  it('renders nx-preflight-card from a :::preflight directive', async () => {
    const json = JSON.stringify(MOCK_PREFLIGHT);
    const msg = { role: 'assistant', content: `:::preflight\n${json}\n:::` };
    const result = renderMessage(msg, null, null);
    const container = await renderToDOM(result);
    expect(container.querySelector('nx-preflight-card')).to.exist;
  });

  it('renders empty preflight card on malformed JSON', async () => {
    const msg = { role: 'assistant', content: ':::preflight\nnot-json\n:::' };
    const result = renderMessage(msg, null, null);
    const container = await renderToDOM(result);
    expect(container.querySelector('.directive-preflight')).to.exist;
  });
});

// ─── renderMessage — RUN_PREFLIGHT tool card ──────────────────────────────

describe('renderMessage — RUN_PREFLIGHT tool card (post-approval)', () => {
  function makeMsg(state) {
    const toolCallId = 'pf-1';
    const toolCards = new Map([
      [toolCallId, { toolName: TOOL_NAME.RUN_PREFLIGHT, state, input: MOCK_PREFLIGHT }],
    ]);
    const msg = {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId }],
    };
    return { msg, toolCards };
  }

  it('renders nx-preflight-card when state is done', async () => {
    const { msg, toolCards } = makeMsg(TOOL_STATE.DONE);
    const result = renderMessage(msg, toolCards, null);
    const container = await renderToDOM(result);
    expect(container.querySelector('nx-preflight-card')).to.exist;
  });

  it('renders nothing when state is approval-requested', async () => {
    const { msg, toolCards } = makeMsg(TOOL_STATE.APPROVAL_REQUESTED);
    const result = renderMessage(msg, toolCards, null);
    const container = await renderToDOM(result);
    // approval-requested suppresses the inline tool card
    expect(container.querySelector('nx-preflight-card')).to.not.exist;
  });
});

// ─── renderApprovalCard — RUN_PREFLIGHT ───────────────────────────────────

describe('renderApprovalCard — RUN_PREFLIGHT', () => {
  const onApprove = () => {};

  it('renders approval-actions panel with preflight summary', async () => {
    const pending = {
      toolCallId: 'pf-1',
      toolName: TOOL_NAME.RUN_PREFLIGHT,
      input: MOCK_PREFLIGHT,
    };
    const result = renderApprovalCard(pending, onApprove);
    const container = await renderToDOM(result);
    expect(container.querySelector('.approval-actions')).to.exist;
    expect(container.querySelector('.approval-tool-name').textContent).to.equal('Pre-flight checks complete');
    expect(container.querySelector('.approval-summary').textContent).to.equal(MOCK_PREFLIGHT.summary);
  });

  it('falls back to readiness% when no summary provided', async () => {
    const { summary: _, ...noSummary } = MOCK_PREFLIGHT;
    const pending = { toolCallId: 'pf-1', toolName: TOOL_NAME.RUN_PREFLIGHT, input: noSummary };
    const result = renderApprovalCard(pending, onApprove);
    const container = await renderToDOM(result);
    expect(container.querySelector('.approval-summary').textContent).to.contain('94%');
  });

  it('renders Approve, Always approve, and Reject buttons', async () => {
    const pending = { toolCallId: 'pf-1', toolName: TOOL_NAME.RUN_PREFLIGHT, input: MOCK_PREFLIGHT };
    const result = renderApprovalCard(pending, onApprove);
    const container = await renderToDOM(result);
    const buttons = [...container.querySelectorAll('.approval-buttons button')];
    const labels = buttons.map((b) => b.querySelector('span').textContent.trim());
    expect(labels).to.include('Approve');
    expect(labels).to.include('Always approve');
    expect(labels).to.include('Reject');
  });

  it('returns nothing when pending is null', () => {
    expect(renderApprovalCard(null, onApprove)).to.equal(nothing);
  });
});

// ─── renderers link handling ──────────────────────────────────────────────

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

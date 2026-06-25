import { expect } from '@esm-bundle/chai';
import { DIRECTIVE_TYPE, TOOL_NAME, TOOL_STATE } from '../../../../nx2/blocks/chat/constants.js';

// Import components so custom elements are registered before renderers run.
import '../../../../nx2/blocks/chat/messages/campaign-plan-card.js';
import '../../../../nx2/blocks/chat/messages/preflight-card.js';
import '../../../../nx2/blocks/chat/messages/task-list.js';
import '../../../../nx2/blocks/chat/messages/task-item.js';

const { renderMessage, renderApprovalCard } = await import('../../../../nx2/blocks/chat/renderers.js');

// Render a Lit TemplateResult into a real DOM node for inspection.
async function renderToDOM(templateResult) {
  const { render } = await import('da-lit');
  const container = document.createElement('div');
  render(templateResult, container);
  // Allow Lit to flush any pending async updates.
  await 0;
  return container;
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

  it('returns nothing when pending is null', async () => {
    const { nothing } = await import('da-lit');
    expect(renderApprovalCard(null, onApprove)).to.equal(nothing);
  });
});

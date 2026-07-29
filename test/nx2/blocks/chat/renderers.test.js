import { expect } from '@esm-bundle/chai';
import { render, nothing } from 'da-lit';
import { renderMessage, renderApprovalCard, renderContinuationCard } from '../../../../nx2/blocks/chat/renderers.js';
import { DIRECTIVE_TYPE, TOOL_NAME, TOOL_STATE } from '../../../../nx2/blocks/chat/constants.js';

// Import components so custom elements are registered before renderers run.
import '../../../../nx2/blocks/chat/messages/campaign-plan-card.js';
import '../../../../nx2/blocks/chat/messages/governance-evaluation-card.js';
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

const MOCK_EVALUATION = {
  brand_name: 'Frescopa Coffee',
  pageUrl: 'https://example.com/index',
  text_evaluation: {
    evaluations: [
      {
        check_id: '1', check_title: 'Tone of voice & messaging', alignment: 'YES', category_id: 'cat-1', category: 'Context',
      },
      {
        check_id: '2', check_title: 'Logo Usage', alignment: 'YES', category_id: 'cat-1', category: 'Context',
      },
      {
        check_id: '3', check_title: 'Title tag present', alignment: 'YES', category_id: 'cat-2', category: 'SEO',
      },
      {
        check_id: '4', check_title: 'Meta description', alignment: 'NO', category_id: 'cat-2', category: 'SEO',
      },
    ],
    successful_checks: 3,
    failed_checks: 1,
    not_applicable_checks: 0,
    error_checks: 0,
  },
  image_evaluations: [],
};

// ─── constants contract ────────────────────────────────────────────────────

describe('DIRECTIVE_TYPE and TOOL_NAME constants', () => {
  it('exports GOVERNANCE_EVALUATION directive type', () => {
    expect(DIRECTIVE_TYPE.GOVERNANCE_EVALUATION).to.equal('governance-evaluation');
  });

  it('exports EVALUATE_PAGE tool name', () => {
    expect(TOOL_NAME.EVALUATE_PAGE).to.equal('evaluate_page');
  });
});

// ─── renderMessage — :::governance-evaluation directive ────────────────────

describe('renderMessage — :::governance-evaluation directive', () => {
  it('renders nx-governance-evaluation-card from a :::governance-evaluation directive', async () => {
    const json = JSON.stringify(MOCK_EVALUATION);
    const msg = { role: 'assistant', content: `:::governance-evaluation\n${json}\n:::` };
    const result = renderMessage(msg, null, null);
    const container = await renderToDOM(result);
    expect(container.querySelector('nx-governance-evaluation-card')).to.exist;
  });

  it('renders empty governance-evaluation card on malformed JSON', async () => {
    const msg = { role: 'assistant', content: ':::governance-evaluation\nnot-json\n:::' };
    const result = renderMessage(msg, null, null);
    const container = await renderToDOM(result);
    expect(container.querySelector('.directive-governance-evaluation')).to.exist;
  });
});

// ─── renderMessage — EVALUATE_PAGE tool card ──────────────────────────────

describe('renderMessage — EVALUATE_PAGE tool card (post-approval)', () => {
  // The tool-call `input` is just the small argument object the agent passed to
  // invoke the tool (e.g. pageUrl/brand_id) — the real evaluation payload only
  // arrives later as the tool-result `output`.
  const MOCK_TOOL_INPUT = { pageUrl: 'https://example.com/index', brand_id: 'brand-1' };

  function makeMsg(state) {
    const toolCallId = 'ge-1';
    const toolCards = new Map([
      [toolCallId, {
        toolName: TOOL_NAME.EVALUATE_PAGE, state, input: MOCK_TOOL_INPUT, output: MOCK_EVALUATION,
      }],
    ]);
    const msg = {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId }],
    };
    return { msg, toolCards };
  }

  it('renders nx-governance-evaluation-card populated from the tool result (output), not the call input', async () => {
    const { msg, toolCards } = makeMsg(TOOL_STATE.DONE);
    const result = renderMessage(msg, toolCards, null);
    const container = await renderToDOM(result);
    document.body.appendChild(container);
    try {
      const card = container.querySelector('nx-governance-evaluation-card');
      await card.updateComplete;
      expect(card.shadowRoot.querySelector('.ge-title').textContent).to.contain('Frescopa Coffee');
      expect(card.shadowRoot.querySelector('.ge-summary-row').textContent).to.contain('3/4 passed');
    } finally {
      container.remove();
    }
  });

  it('populates the card when the tool output arrives as a JSON string (MCP result shape)', async () => {
    // da-agent forwards MCP tool results verbatim, so `output` is a JSON *string*,
    // not an object like native tools (content_read) return.
    const toolCallId = 'ge-str-1';
    const toolCards = new Map([
      [toolCallId, {
        toolName: TOOL_NAME.EVALUATE_PAGE,
        state: TOOL_STATE.DONE,
        input: MOCK_TOOL_INPUT,
        output: JSON.stringify(MOCK_EVALUATION),
      }],
    ]);
    const msg = { role: 'assistant', content: [{ type: 'tool-call', toolCallId }] };
    const container = await renderToDOM(renderMessage(msg, toolCards, null));
    document.body.appendChild(container);
    try {
      const card = container.querySelector('nx-governance-evaluation-card');
      await card.updateComplete;
      expect(card.shadowRoot.querySelector('.ge-title').textContent).to.contain('Frescopa Coffee');
      expect(card.shadowRoot.querySelector('.ge-summary-row').textContent).to.contain('3/4 passed');
    } finally {
      container.remove();
    }
  });

  it('renders nothing when state is approval-requested', async () => {
    const { msg, toolCards } = makeMsg(TOOL_STATE.APPROVAL_REQUESTED);
    const result = renderMessage(msg, toolCards, null);
    const container = await renderToDOM(result);
    // approval-requested suppresses the inline tool card
    expect(container.querySelector('nx-governance-evaluation-card')).to.not.exist;
  });

  [TOOL_STATE.RUNNING, TOOL_STATE.APPROVED, TOOL_STATE.REJECTED].forEach((state) => {
    it(`renders a loading spinner, not the empty scorecard, while state is ${state}`, async () => {
      const toolCallId = `ge-${state}-1`;
      const toolCards = new Map([
        [toolCallId, {
          toolName: TOOL_NAME.EVALUATE_PAGE,
          state,
          input: MOCK_TOOL_INPUT,
          output: undefined,
        }],
      ]);
      const msg = { role: 'assistant', content: [{ type: 'tool-call', toolCallId }] };
      const container = await renderToDOM(renderMessage(msg, toolCards, null));
      document.body.appendChild(container);
      try {
        const card = container.querySelector('nx-governance-evaluation-card');
        await card.updateComplete;
        expect(card.shadowRoot.querySelector('.ge-loading')).to.exist;
        expect(card.shadowRoot.querySelector('.ge-summary-row')).to.not.exist;
      } finally {
        container.remove();
      }
    });
  });

  describe('when state is error', () => {
    function makeErrorMsg(output) {
      const toolCallId = 'ge-error-1';
      const toolCards = new Map([
        [toolCallId, {
          toolName: TOOL_NAME.EVALUATE_PAGE,
          state: TOOL_STATE.ERROR,
          input: MOCK_TOOL_INPUT,
          output,
        }],
      ]);
      const msg = { role: 'assistant', content: [{ type: 'tool-call', toolCallId }] };
      return { msg, toolCards };
    }

    async function renderErrorCard(output) {
      const { msg, toolCards } = makeErrorMsg(output);
      const container = await renderToDOM(renderMessage(msg, toolCards, null));
      document.body.appendChild(container);
      const card = container.querySelector('nx-governance-evaluation-card');
      await card.updateComplete;
      return { card, container };
    }

    it('renders the error message, not the empty scorecard', async () => {
      const { card, container } = await renderErrorCard({ error: 'Sample failure' });
      try {
        expect(card.shadowRoot.querySelector('.ge-error-text').textContent).to.contain('Sample failure');
        expect(card.shadowRoot.querySelector('.ge-loading')).to.not.exist;
        expect(card.shadowRoot.querySelector('.ge-summary-row')).to.not.exist;
      } finally {
        container.remove();
      }
    });

    it('falls back to a generic message when output is missing', async () => {
      const { card, container } = await renderErrorCard(undefined);
      try {
        expect(card.shadowRoot.querySelector('.ge-error-text').textContent).to.contain('Page evaluation failed.');
      } finally {
        container.remove();
      }
    });

    it('falls back to a generic message when output.error is not a string', async () => {
      const { card, container } = await renderErrorCard({ error: { code: 500 } });
      try {
        expect(card.shadowRoot.querySelector('.ge-error-text').textContent).to.contain('Page evaluation failed.');
      } finally {
        container.remove();
      }
    });
  });

  it('renders nx-governance-evaluation-card when da-agent sends the MCP-qualified tool name', async () => {
    const toolCallId = 'ge-mcp-1';
    const toolCards = new Map([
      [toolCallId, {
        toolName: 'mcp__governance-agent__evaluate_page',
        state: TOOL_STATE.DONE,
        input: MOCK_TOOL_INPUT,
        output: MOCK_EVALUATION,
      }],
    ]);
    const msg = { role: 'assistant', content: [{ type: 'tool-call', toolCallId }] };
    const result = renderMessage(msg, toolCards, null);
    const container = await renderToDOM(result);
    expect(container.querySelector('nx-governance-evaluation-card')).to.exist;
  });
});

// ─── renderApprovalCard — EVALUATE_PAGE no longer pre-exec gated ──────────

describe('renderApprovalCard — EVALUATE_PAGE', () => {
  const onApprove = () => {};

  it('no longer renders the "Governance evaluation complete" pre-exec card', async () => {
    // evaluate_page now runs without pre-execution approval; the post-execution
    // continuation prompt replaces the old approval-card hack. If renderApprovalCard
    // is ever called for it, it must fall through to the generic card, not the hack.
    const pending = { toolCallId: 'ge-1', toolName: TOOL_NAME.EVALUATE_PAGE, input: MOCK_EVALUATION };
    const container = await renderToDOM(renderApprovalCard(pending, onApprove));
    expect(container.querySelector('.approval-tool-name').textContent).to.not.equal('Governance evaluation complete');
  });

  it('returns nothing when pending is null', () => {
    expect(renderApprovalCard(null, onApprove)).to.equal(nothing);
  });
});

// ─── renderContinuationCard — post-execution Continue/Stop prompt ─────────

describe('renderContinuationCard', () => {
  it('returns nothing when there is no pending continuation', () => {
    expect(renderContinuationCard(null, () => {}, () => {})).to.equal(nothing);
  });

  it('renders Continue and Stop buttons', async () => {
    const pending = { toolCallId: 'ge-1', toolName: 'mcp__governance-agent__evaluate_page' };
    const container = await renderToDOM(renderContinuationCard(pending, () => {}, () => {}));
    const labels = [...container.querySelectorAll('.approval-buttons button')]
      .map((b) => b.querySelector('span').textContent.trim());
    expect(labels).to.deep.equal(['Stop', 'Continue']);
  });

  it('wires Continue and Stop to their callbacks', async () => {
    let continued = 0;
    let stopped = 0;
    const pending = { toolCallId: 'ge-1', toolName: 'mcp__governance-agent__evaluate_page' };
    const container = await renderToDOM(
      renderContinuationCard(pending, () => { continued += 1; }, () => { stopped += 1; }),
    );
    const [stopBtn, continueBtn] = container.querySelectorAll('.approval-buttons button');
    continueBtn.click();
    stopBtn.click();
    expect(continued).to.equal(1);
    expect(stopped).to.equal(1);
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

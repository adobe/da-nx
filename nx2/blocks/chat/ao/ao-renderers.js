import { html, nothing } from 'da-lit';
import { renderMessageContent } from '../renderers/renderers.js';

/**
 * Rendering for AO-only concepts that have no da-agent equivalent: user
 * questions, plan approval, a2ui artifacts, and cross-surface episode
 * continuity. Nothing here is a variant of an existing renderers.js function —
 * these are genuinely new UI surfaces, so unlike card-renderers.js this module
 * isn't a migration target for da-agent's rendering, just AO's own.
 */

// Some AO payloads (e.g. user_question context) arrive with literal backslash-n
// sequences instead of real newlines, which remark renders as visible "\n" text
// rather than paragraph/list breaks. Normalize before parsing. Scoped to AO's own
// text fields rather than fixed in the shared renderMessageContent, since this is
// a quirk of AO's payloads, not a general markdown-rendering concern.
function unescapeLiteralNewlines(text) {
  return text.replace(/\\r\\n|\\n/g, '\n');
}

function renderAoMarkdown(text) {
  return renderMessageContent(unescapeLiteralNewlines(text ?? ''));
}

function renderQuestionOption(qId, opt, entry, multiSelect, onToggle) {
  const selected = entry.options.has(opt.label);
  return html`
    <button
      type="button"
      class="question-option ${selected ? 'selected' : ''}"
      @click=${() => onToggle(qId, opt.label, multiSelect)}
    >
      <span class="question-option-label">${opt.label}</span>
      ${opt.description ? html`<span class="question-option-description">${opt.description}</span>` : nothing}
    </button>
  `;
}

function renderQuestion(q, answers, onToggle, onText) {
  const entry = answers[q.id] ?? { options: new Set(), text: '' };
  return html`
    <div class="question-block">
      <span class="question-header">${q.header}</span>
      <div class="question-text">${renderAoMarkdown(q.question)}</div>
      ${q.options?.length ? html`
        <div class="question-options">
          ${q.options.map((opt) => renderQuestionOption(q.id, opt, entry, q.multi_select, onToggle))}
        </div>` : nothing}
      <input
        type="text"
        class="question-freetext"
        placeholder="Or type your own answer…"
        .value=${entry.text}
        @input=${(e) => onText(q.id, e.target.value)}
      />
    </div>
  `;
}

export function renderQuestionCard(pending, answers, {
  onToggle, onText, onSubmit, onDecline,
}) {
  if (!pending) return nothing;
  const { questions, context } = pending;
  return html`
    <div class="question-actions">
      ${context ? html`<div class="question-context">${renderAoMarkdown(context)}</div>` : nothing}
      ${questions.map((q) => renderQuestion(q, answers, onToggle, onText))}
      <div class="question-buttons">
        <button type="button" class="secondary-btn" @click=${onDecline}>
          <span>Decline</span>
        </button>
        <button type="button" class="action-btn" @click=${onSubmit}>
          <span>Submit</span>
        </button>
      </div>
    </div>
  `;
}

// plan_approval_request: the agent produced a plan and suspended the turn pending
// review. Response goes back via the generic RESUME op with a plan-response
// DataPart (see chat-controller-ao.js#respondToPlanApproval) — there's no
// dedicated PLAN_RESPONSE WS frame type, unlike permission/question.
export function renderPlanApprovalCard(pending, feedback, { onFeedbackText, onApprove, onReject }) {
  if (!pending) return nothing;
  const { planContent } = pending;
  return html`
    <div class="plan-approval-actions">
      <span class="plan-approval-header">Review plan</span>
      <div class="plan-approval-content message-content">${renderAoMarkdown(planContent)}</div>
      <input
        type="text"
        class="plan-approval-feedback"
        placeholder="Optional feedback if rejecting…"
        .value=${feedback}
        @input=${(e) => onFeedbackText(e.target.value)}
      />
      <div class="plan-approval-buttons">
        <button type="button" class="secondary-btn" @click=${onReject}>
          <span>Reject</span>
        </button>
        <button type="button" class="action-btn" @click=${onApprove}>
          <span>Approve</span>
        </button>
      </div>
    </div>
  `;
}

// Cross-surface episode continuity (chat-controller-ao.js#_reconcileWithLatestEpisode):
// surfaced only when the owner's most-recently-active conversation lives on a
// different episode than the one open here — switching replaces this tab's
// conversation with that one; dismissing just hides the banner until an even
// newer episode shows up.
export function renderNewerEpisodeBanner(info, { onSwitch, onDismiss }) {
  if (!info) return nothing;
  return html`
    <div class="newer-episode-banner">
      <span class="newer-episode-text">
        You have a newer conversation${info.title ? html` — <strong>${info.title}</strong>` : ''}.
      </span>
      <div class="newer-episode-actions">
        <button type="button" class="secondary-btn" @click=${onDismiss}>
          <span>Dismiss</span>
        </button>
        <button type="button" class="action-btn" @click=${onSwitch}>
          <span>Switch</span>
        </button>
      </div>
    </div>
  `;
}

function renderDataTable({ columns = [], data = [] } = {}) {
  return html`
    <div class="ui-artifact-table-wrapper">
      <table class="ui-artifact-table">
        <thead>
          <tr>${columns.map((col) => html`<th>${col.label ?? col.key}</th>`)}</tr>
        </thead>
        <tbody>
          ${data.map((row) => html`
            <tr>${columns.map((col) => html`<td>${row[col.key] ?? ''}</td>`)}</tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
}

// Plan cards (surface_id "sample-plan-card" today) arrive as a single Markdown
// component — reuse the same markdown pipeline as regular assistant text so
// headings/lists/checklists render the same way, inside a bordered card to set
// it apart from a plain chat bubble.
function renderMarkdownArtifact({ content = '' } = {}) {
  return html`
    <div class="ui-artifact-markdown">
      <div class="message-content">${renderAoMarkdown(content)}</div>
    </div>
  `;
}

// Cross-surface component (also rendered as Teams AdaptiveCard chips by
// cx-surface's next_actions_card builder — same { prompts: [{ title, prompt }] }
// shape there). Clicking a chip sends its `prompt` through onSendPrompt, which
// chat.js wires to the same "send this text" path used by the prompt-shortcut popover.
function renderNextActionsCard({ prompts = [] } = {}, { onSendPrompt } = {}) {
  if (!prompts.length) return nothing;
  return html`
    <div class="ui-artifact-next-actions">
      <span class="ui-artifact-next-actions-header">Next, would you like to:</span>
      ${prompts.map(({ title, prompt }) => html`
        <button type="button" class="ui-artifact-next-action-chip"
          @click=${() => onSendPrompt?.(prompt)}
        >${title || prompt}</button>
      `)}
    </div>
  `;
}

// Registry of a2ui component types we know how to render. Add to this as we encounter
// (and choose to support) new ones — anything not listed here falls back to the
// artifact's own text_fallback instead of being silently dropped.
const UI_ARTIFACT_RENDERERS = {
  DataTable: renderDataTable,
  Markdown: renderMarkdownArtifact,
  NextActionsCard: renderNextActionsCard,
};

function renderUiArtifactComponent(component, fallbackText, onSendPrompt) {
  const renderer = UI_ARTIFACT_RENDERERS[component.type];
  if (renderer) return renderer(component.props, { onSendPrompt });
  return html`<p class="ui-artifact-fallback">${fallbackText || `Unsupported content (${component.type}).`}</p>`;
}

export function renderUiArtifact(uiArtifact, onSendPrompt) {
  if (!uiArtifact) return nothing;
  const { components, textFallback, title } = uiArtifact;
  if (!components?.length) {
    return textFallback ? html`<p class="ui-artifact-fallback">${textFallback}</p>` : nothing;
  }
  return html`
    <div class="ui-artifact">
      ${title ? html`<span class="ui-artifact-title">${title}</span>` : nothing}
      ${components.map((c) => renderUiArtifactComponent(c, textFallback, onSendPrompt))}
    </div>
  `;
}

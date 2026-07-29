import { html, nothing } from 'da-lit';
import { AGENT_EVENT, ROLE, TOOL_INPUT, TOOL_STATE } from './constants.js';
import { getConfig } from '../../scripts/nx.js';
import { parseDirectives } from './utils/parse.js';
import { pillIconName } from './utils/icons.js';
import { linkifyBareUrls, sanitizeLinks } from './utils/links.js';

const { codeBase } = getConfig();

const { unified, remarkParse, remarkGfmNoLink, mdast2hast, hastToDom } = await import('../../deps/mdast/dist/index.js');

const parser = unified().use(remarkParse).use(remarkGfmNoLink);

function toDOM(hast) {
  return hastToDom(sanitizeLinks(linkifyBareUrls(hast)), { fragment: true });
}

function renderMessageContent(text) {
  if (!text) return nothing;

  return parseDirectives(text).map(({ kind, type, content }) => {
    if (!content) return nothing;
    const dom = toDOM(mdast2hast(parser.parse(content)));
    return kind === 'directive' ? html`<div class="directive directive-${type}">${dom}</div>` : dom;
  });
}

function approvalSummary(input, { json = false } = {}) {
  if (!input) return null;
  const {
    HUMAN_READABLE_SUMMARY, SOURCE_PATH, DESTINATION_PATH, PATH, SKILL_ID, NAME,
  } = TOOL_INPUT;
  return input[HUMAN_READABLE_SUMMARY]
    ?? (input[SOURCE_PATH] && input[DESTINATION_PATH] ? `${input[SOURCE_PATH]} → ${input[DESTINATION_PATH]}` : null)
    ?? input[PATH] ?? input[SKILL_ID] ?? input[NAME]
    ?? (json ? JSON.stringify(input, null, 2) : null);
}

function renderToolCard(toolCallId, toolCards) {
  const card = toolCards?.get(toolCallId);
  if (!card || card.state === TOOL_STATE.APPROVAL_REQUESTED) return nothing;
  const { toolName, state, input } = card;
  const detail = approvalSummary(input, { json: true });
  const failed = state === TOOL_STATE.ERROR || state === TOOL_STATE.REJECTED;
  const status = failed ? html`<span class="tool-card-status">${state}</span>` : nothing;
  return detail ? html`
    <details class="tool-card tool-card-${state}">
      <summary>${toolName}${status}</summary>
      <span class="tool-card-detail">${detail}</span>
    </details>` : html`<span class="tool-card-detail">${toolName}${status}</span>`;
}

function renderApprovalCard(pending, onApprove) {
  if (!pending) return nothing;
  const { toolCallId, toolName, input } = pending;
  const summary = approvalSummary(input);
  return html`
    <div class="approval-actions">
      <span class="approval-tool-name">${toolName}</span>
      ${summary ? html`<span class="approval-summary">${summary}</span>` : nothing}
      <div class="approval-buttons">
        <button type="button" class="secondary-btn" @click=${() => onApprove(toolCallId, false)}>
          <span>Reject</span><kbd>Esc</kbd>
        </button>
        <button type="button" class="secondary-btn" @click=${() => onApprove(toolCallId, true, true)}>
          <span>Always approve</span><kbd>⌘↵</kbd>
        </button>
        <button type="button" class="action-btn" @click=${() => onApprove(toolCallId, true)}>
          <span>Approve</span><kbd>↵</kbd>
        </button>
      </div>
    </div>
  `;
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
      <p class="question-text">${q.question}</p>
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

function renderQuestionCard(pending, answers, {
  onToggle, onText, onSubmit, onDecline,
}) {
  if (!pending) return nothing;
  const { questions, context } = pending;
  return html`
    <div class="question-actions">
      ${context ? html`<p class="question-context">${context}</p>` : nothing}
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

// Registry of a2ui component types we know how to render. Add to this as we encounter
// (and choose to support) new ones — anything not listed here falls back to the
// artifact's own text_fallback instead of being silently dropped.
const UI_ARTIFACT_RENDERERS = {
  DataTable: renderDataTable,
};

function renderUiArtifactComponent(component, fallbackText) {
  const renderer = UI_ARTIFACT_RENDERERS[component.type];
  if (renderer) return renderer(component.props);
  return html`<p class="ui-artifact-fallback">${fallbackText || `Unsupported content (${component.type}).`}</p>`;
}

function renderUiArtifact(uiArtifact) {
  if (!uiArtifact) return nothing;
  const { components, textFallback, title } = uiArtifact;
  if (!components?.length) {
    return textFallback ? html`<p class="ui-artifact-fallback">${textFallback}</p>` : nothing;
  }
  return html`
    <div class="ui-artifact">
      ${title ? html`<span class="ui-artifact-title">${title}</span>` : nothing}
      ${components.map((c) => renderUiArtifactComponent(c, textFallback))}
    </div>
  `;
}

function renderAssistantMessage(msg, toolCards) {
  if (msg.uiArtifact) return renderUiArtifact(msg.uiArtifact);

  if (Array.isArray(msg.content)) {
    return html`${msg.content.map((part) => (part.type === AGENT_EVENT.TOOL_CALL
      ? renderToolCard(part.toolCallId, toolCards)
      : nothing))}`;
  }

  const copy = msg.streaming ? nothing : html`<button class="message-action-copy nx-action-btn-icon" @click=${() => navigator.clipboard.writeText(msg.content)} aria-label="Copy">
      <svg class="icon-paste" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-paste-20-n.svg#icon"></use></svg>
      <svg class="icon-checkmark" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-checkmark-20-n.svg#icon"></use></svg>
    </button>`;

  return html`
    <div class="message message-assistant">
      <div class="message-content">${renderMessageContent(msg.content)}</div>
      ${copy}
    </div>
  `;
}

function renderSelectionPills(msg) {
  const contextItem = (name, iconName) => html`
    <li class="selection-context-item">
      <svg class="selection-icon" viewBox="0 0 20 20" aria-hidden="true">
        <use href="${codeBase}/img/icons/${iconName}.svg#icon"></use>
      </svg>
      <span>${name}</span>
    </li>`;

  const items = [
    ...(msg.selectionContext ?? []).map((sc) => {
      const name = sc.blockName || 'Selection';
      return contextItem(name, pillIconName(sc.type, name));
    }),
    ...(msg.attachmentsMeta ?? []).map(({ fileName }) => (
      contextItem(fileName, pillIconName(undefined, fileName))
    )),
  ];
  if (items.length === 1) {
    return html`<ul class="selection-context-list" aria-label="Attached context">${items[0]}</ul>`;
  }
  if (items.length > 1) {
    return html`<details class="selection-context">
        <summary><span class="selection-context-count">${items.length} items added</span></summary>
        <ul class="selection-context-list">${items}</ul>
      </details>`;
  }
  return nothing;
}

function renderUserMessage(msg) {
  return html`
    <div class="message message-user">
      ${renderSelectionPills(msg)}
      <div class="message-content">${msg.content}</div>
    </div>
  `;
}

function renderMessage(msg, toolCards) {
  if (msg.role === ROLE.TOOL) return nothing;
  return msg.role === ROLE.ASSISTANT
    ? renderAssistantMessage(msg, toolCards)
    : renderUserMessage(msg);
}

export { renderMessage, renderApprovalCard, renderQuestionCard };

import { html, nothing } from 'da-lit';
import {
  PART_TYPE, ROLE, TOOL_INPUT, TOOL_STATE,
} from '../constants.js';
import { parseDirectives } from '../utils/parse.js';
import { linkifyBareUrls, sanitizeLinks } from '../utils/links.js';
import { parseMarkdown } from '../../shared/chat/markdown.js';
import { renderCopyButton } from '../../shared/chat/copy-button.js';
import { renderSelectionPills } from '../../shared/chat/selection-pills.js';

const { hastToDom } = await import('../../../deps/mdast/dist/index.js');

function toDOM(hast) {
  return hastToDom(sanitizeLinks(linkifyBareUrls(hast)), { fragment: true });
}

function renderMessageContent(text) {
  if (!text) return nothing;

  return parseDirectives(text).map(({ kind, type, content }) => {
    if (!content) return nothing;
    const dom = toDOM(parseMarkdown(content));
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
  if (!card || card.state === TOOL_STATE.AWAITING_APPROVAL) return nothing;
  const { toolName, state, input } = card;
  const detail = approvalSummary(input, { json: true });
  const failed = state === TOOL_STATE.OUTPUT_ERROR || state === TOOL_STATE.REJECTED;
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

function renderAssistantMessage(msg, toolCards) {
  if (Array.isArray(msg.content)) {
    return html`${msg.content.map((part) => (part.type === PART_TYPE.TOOL
      ? renderToolCard(part.toolCallId, toolCards)
      : nothing))}`;
  }

  return html`
    <div class="message message-assistant">
      <div class="message-content">${renderMessageContent(msg.content)}</div>
      ${renderCopyButton(msg.content, { streaming: msg.streaming })}
    </div>
  `;
}

function renderUserMessage(msg) {
  return html`
    <div class="message message-user">
      ${renderSelectionPills(msg)}
      ${msg.thumbnail
    ? html`<img
          class="message-fig-thumb"
          src=${msg.thumbnail}
          alt="Figma design preview"
          style="display:block;max-width:240px;width:100%;border-radius:8px;margin-bottom:6px;"
        />`
    : nothing}
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

// renderMessageContent is additionally exported (no implementation change) so
// ao/ao-renderers.js can reuse the same markdown/directive pipeline instead of
// duplicating it — see card-renderers.js's file header for the migration rationale.
export { renderMessage, renderApprovalCard, renderMessageContent };

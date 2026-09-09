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

// A failed tool call carries da-agent's message in `errorText` (e.g.
// "DA Admin API Error (404): Not Found"). Surface its first line instead of a
// bare state like "output-error" so the reason is visible without expanding.
function summarizeToolError(text) {
  if (typeof text !== 'string') return null;
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean);
  return firstLine ? firstLine.slice(0, 100) : null;
}

function renderToolCard(toolCallId, toolCards) {
  const card = toolCards?.get(toolCallId);
  if (!card || card.state === TOOL_STATE.AWAITING_APPROVAL) return nothing;
  const {
    toolName, state, input, errorText,
  } = card;
  const failed = state === TOOL_STATE.OUTPUT_ERROR || state === TOOL_STATE.REJECTED;
  const label = failed ? (summarizeToolError(errorText) ?? state) : null;
  const status = failed ? html`<span class="tool-card-status">${label}</span>` : nothing;
  const detail = failed ? errorText : approvalSummary(input, { json: true });
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

export { renderMessage, renderApprovalCard, summarizeToolError };

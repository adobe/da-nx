import { html, nothing } from 'da-lit';
import { AGENT_EVENT, ROLE, TOOL_INPUT, TOOL_STATE } from './constants.js';
import { getConfig } from '../../scripts/nx.js';
import { parseDirectives } from './utils/parse.js';
import { fileIconName } from './utils/icons.js';

const { codeBase } = getConfig();

const { unified, remarkParse, remarkGfmNoLink, mdast2hast } = await import('../../deps/mdast/dist/index.js');

const SAFE_URL = /^https?:\/\//i;

const parser = unified().use(remarkParse).use(remarkGfmNoLink);

function renderElement(node) {
  if (node.type === 'root') return node.children.map(renderElement);
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return nothing;

  const children = () => node.children.map(renderElement);

  switch (node.tagName) {
    case 'p': return html`<p>${children()}</p>`;
    case 'h1': return html`<h1>${children()}</h1>`;
    case 'h2': return html`<h2>${children()}</h2>`;
    case 'h3': return html`<h3>${children()}</h3>`;
    case 'h4': return html`<h4>${children()}</h4>`;
    case 'h5': return html`<h5>${children()}</h5>`;
    case 'h6': return html`<h6>${children()}</h6>`;
    case 'ul': return html`<ul>${children()}</ul>`;
    case 'ol': return html`<ol>${children()}</ol>`;
    case 'li': return html`<li>${children()}</li>`;
    case 'strong': return html`<strong>${children()}</strong>`;
    case 'em': return html`<em>${children()}</em>`;
    case 'code': return html`<code>${children()}</code>`;
    case 'pre': return html`<pre>${children()}</pre>`;
    case 'blockquote': return html`<blockquote>${children()}</blockquote>`;
    case 'table': return html`<table>${children()}</table>`;
    case 'thead': return html`<thead>${children()}</thead>`;
    case 'tbody': return html`<tbody>${children()}</tbody>`;
    case 'tr': return html`<tr>${children()}</tr>`;
    case 'th': return html`<th>${children()}</th>`;
    case 'td': return html`<td>${children()}</td>`;
    case 'a': {
      const href = SAFE_URL.test(node.properties?.href) ? node.properties.href : '#';
      return html`<a href="${href}" target="_blank" rel="noopener noreferrer">${children()}</a>`;
    }
    default: return html`${children()}`;
  }
}

function renderChecklistLi(node) {
  const [first, ...rest] = node.children;
  if (first?.tagName !== 'input') return html`<li>${node.children.map(renderElement)}</li>`;
  const checked = first.properties?.checked ?? false;
  return html`<li class="${checked ? 'checked' : 'unchecked'}">
    <input type="checkbox" ?checked=${checked} disabled><span>${rest.map(renderElement)}</span>
  </li>`;
}

function renderDirective(type, content) {
  const hast = mdast2hast(parser.parse(content));

  if (type === 'toggle-list') {
    const items = hast.children.map((node) => (node.tagName === 'blockquote'
      ? html`<li>${node.children.map(renderElement)}</li>`
      : renderElement(node)));
    return html`<ul class="directive directive-toggle-list">${items}</ul>`;
  }

  if (type === 'checklist') {
    const inner = hast.children.map((node) => {
      if (node.tagName !== 'ul' && node.tagName !== 'ol') return renderElement(node);
      const items = node.children
        .filter((child) => child.type === 'element')
        .map((child) => (child.tagName === 'li' ? renderChecklistLi(child) : renderElement(child)));
      return node.tagName === 'ol' ? html`<ol>${items}</ol>` : html`<ul>${items}</ul>`;
    });

    return html`<div class="directive directive-checklist">${inner}</div>`;
  }

  return html`<div class="directive directive-${type}">${renderElement(hast)}</div>`;
}

function renderMessageContent(text) {
  if (!text) return nothing;
  return parseDirectives(text).map(({ kind, type, content }) => (kind === 'directive'
    ? renderDirective(type, content)
    : renderElement(mdast2hast(parser.parse(content)))));
}

function approvalSummary(input) {
  if (!input) return null;
  const {
    HUMAN_READABLE_SUMMARY, SOURCE_PATH, DESTINATION_PATH, PATH, SKILL_ID, NAME,
  } = TOOL_INPUT;
  return input[HUMAN_READABLE_SUMMARY]
    ?? (input[SOURCE_PATH] && input[DESTINATION_PATH] ? `${input[SOURCE_PATH]} → ${input[DESTINATION_PATH]}` : null)
    ?? input[PATH] ?? input[SKILL_ID] ?? input[NAME] ?? null;
}

function renderToolCard(toolCallId, toolCards) {
  const card = toolCards?.get(toolCallId);
  if (!card || card.state === TOOL_STATE.APPROVAL_REQUESTED) return nothing;
  const { toolName, state, input } = card;
  const detail = approvalSummary(input);
  const failed = state === TOOL_STATE.ERROR || state === TOOL_STATE.REJECTED;
  return html`
    <details class="tool-card tool-card-${state}">
      <summary>${toolName}${failed ? html`<span class="tool-card-status">${state}</span>` : nothing}</summary>
      ${detail ? html`<span class="tool-card-detail">${detail}</span>` : nothing}
    </details>
  `;
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
    return html`${msg.content.map((part) => (part.type === AGENT_EVENT.TOOL_CALL
      ? renderToolCard(part.toolCallId, toolCards)
      : nothing))}`;
  }

  const copy = msg.streaming ? nothing : html`<button class="message-action-copy" @click=${() => navigator.clipboard.writeText(msg.content)} aria-label="Copy">
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
  const contextItem = (name) => html`
    <li class="selection-context-item">
      <svg class="selection-icon" viewBox="0 0 20 20" aria-hidden="true">
        <use href="${codeBase}/img/icons/${fileIconName(name)}.svg#icon"></use>
      </svg>
      <span>${name}</span>
    </li>`;

  const items = [
    ...(msg.selectionContext ?? []).map(({ blockName }) => contextItem(blockName)),
    ...(msg.attachmentsMeta ?? []).map(({ fileName }) => contextItem(fileName)),
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

export { renderMessage, renderApprovalCard };

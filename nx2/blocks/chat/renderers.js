import { html, nothing } from 'da-lit';
import { AGENT_EVENT, ROLE, TOOL_INPUT, TOOL_STATE } from './constants.js';
import { getConfig } from '../../scripts/nx.js';
import { parseDirectives } from './utils/parse.js';
import { pillIconName } from './utils/icons.js';

const { codeBase } = getConfig();

const { unified, remarkParse, remarkGfmNoLink, mdast2hast, hastToDom } = await import('../../deps/mdast/dist/index.js');

const SAFE_URL = /^https?:\/\//i;
const BARE_URL = /https?:\/\/[^\s<>]+/g;
const TRAILING_PUNCT = /[.,;:!?]+$/;
const LINKIFY_SKIP = new Set(['a', 'code', 'pre']);

const parser = unified().use(remarkParse).use(remarkGfmNoLink);

const countChar = (str, char) => str.split(char).length - 1;

function splitUrlText(value) {
  const nodes = [];
  let lastIndex = 0;
  let matched = false;

  for (const match of value.matchAll(BARE_URL)) {
    matched = true;
    let url = match[0];
    let trailing = '';

    const punct = url.match(TRAILING_PUNCT);
    if (punct) {
      [trailing] = punct;
      url = url.slice(0, -trailing.length);
    }
    while (url.endsWith(')') && countChar(url, ')') > countChar(url, '(')) {
      trailing = `)${trailing}`;
      url = url.slice(0, -1);
    }

    if (match.index > lastIndex) {
      nodes.push({ type: 'text', value: value.slice(lastIndex, match.index) });
    }
    nodes.push({
      type: 'element',
      tagName: 'a',
      properties: { href: url },
      children: [{ type: 'text', value: url }],
    });
    if (trailing) nodes.push({ type: 'text', value: trailing });
    lastIndex = match.index + match[0].length;
  }

  if (!matched) return null;
  if (lastIndex < value.length) nodes.push({ type: 'text', value: value.slice(lastIndex) });
  return nodes;
}

function linkifyBareUrls(node) {
  if (!node.children) return node;
  if (node.type === 'element' && LINKIFY_SKIP.has(node.tagName)) return node;

  node.children = node.children.flatMap((child) => {
    if (child.type === 'text') return splitUrlText(child.value) ?? [child];
    return [linkifyBareUrls(child)];
  });
  return node;
}

function sanitizeLinks(node) {
  if (node.type === 'element' && node.tagName === 'a') {
    const href = node.properties?.href ?? '';
    node.properties = {
      ...node.properties,
      href: SAFE_URL.test(href) ? href : '#',
      target: '_blank',
      rel: ['noopener', 'noreferrer'],
    };
  }
  node.children?.forEach(sanitizeLinks);
  return node;
}

function toDOM(hast) {
  return hastToDom(sanitizeLinks(linkifyBareUrls(hast)), { fragment: true });
}

function renderMessageContent(text) {
  if (!text) return nothing;

  return parseDirectives(text).map(({ kind, type, content }) => {
    const dom = toDOM(mdast2hast(parser.parse(content)));
    return kind === 'directive' ? html`<div class="directive directive-${type}">${dom}</div>` : dom;
  });
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

export { renderMessage, renderApprovalCard };

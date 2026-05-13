import { html, nothing } from 'da-lit';
import { AGENT_EVENT, ROLE, TOOL_INPUT, TOOL_STATE } from './constants.js';
import { unified, remarkParse } from '../../deps/mdast/dist/index.js';

function renderNode(node) {
  switch (node.type) {
    case 'root':
      return node.children.map(renderNode);
    case 'paragraph':
      return html`<p>${node.children.map(renderNode)}</p>`;
    case 'heading': {
      const children = node.children.map(renderNode);
      switch (node.depth) {
        case 1: return html`<h1>${children}</h1>`;
        case 2: return html`<h2>${children}</h2>`;
        case 3: return html`<h3>${children}</h3>`;
        case 4: return html`<h4>${children}</h4>`;
        case 5: return html`<h5>${children}</h5>`;
        case 6: return html`<h6>${children}</h6>`;
        default: return html`<p><strong>${children}</strong></p>`;
      }
    }
    case 'list':
      return node.ordered
        ? html`<ol>${node.children.map(renderNode)}</ol>`
        : html`<ul>${node.children.map(renderNode)}</ul>`;
    case 'listItem': {
      const children = node.spread
        ? node.children.map(renderNode)
        : node.children.flatMap((c) => (c.type === 'paragraph' ? c.children.map(renderNode) : [renderNode(c)]));
      return html`<li>${children}</li>`;
    }
    case 'strong':
      return html`<strong>${node.children.map(renderNode)}</strong>`;
    case 'emphasis':
      return html`<em>${node.children.map(renderNode)}</em>`;
    case 'inlineCode':
      return html`<code>${node.value}</code>`;
    case 'code':
      return html`<pre><code>${node.value}</code></pre>`;
    case 'link':
      return html`<a href="${node.url}" target="_blank" rel="noopener noreferrer">${node.children.map(renderNode)}</a>`;
    case 'blockquote':
      return html`<blockquote>${node.children.map(renderNode)}</blockquote>`;
    case 'thematicBreak':
      return html`<hr>`;
    case 'text':
      return node.value;
    default:
      return nothing;
  }
}

const parser = unified().use(remarkParse);

const ALERT_ICONS = { info: 'ℹ️', warning: '⚠️', error: '❌' };

/**
 * Convert :::directive ... ::: blocks (from the agent system prompt) into
 * standard markdown before passing to remarkParse.
 */
function preprocessDirectives(text) {
  return text.replace(/:::([a-z-]+)\n([\s\S]*?):::/g, (_match, type, content) => {
    const lines = content.trim().split('\n').filter(Boolean);

    if (type === 'list') {
      return lines.map((l) => `- ${l.replace(/^-\s*/, '')}`).join('\n');
    }
    if (type === 'checklist') {
      return lines.map((l) => {
        const stripped = l.replace(/^-\s*/, '');
        return /^\[[ x]\]/i.test(stripped) ? `- ${stripped}` : `- [ ] ${stripped}`;
      }).join('\n');
    }
    if (type.startsWith('alert-')) {
      const variant = type.replace('alert-', '');
      const icon = ALERT_ICONS[variant] ?? '📌';
      return `> ${icon} ${lines.join(' ')}`;
    }
    if (type === 'toggle-list') {
      return lines
        .map((l) => (/^>\s+/.test(l) ? `**${l.replace(/^>\s+/, '')}**` : l))
        .join('\n');
    }
    return lines.join('\n');
  });
}

function renderMessageContent(text) {
  if (!text) return nothing;
  const tree = parser.parse(preprocessDirectives(text));
  return renderNode(tree);
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

function renderSkillPreview(input) {
  if (!input?.skillId || !input?.content) return nothing;
  return html`
    <div class="message message-assistant">
      <div class="skill-preview">
        <div class="skill-preview-header">
          <span class="skill-preview-label">Skill</span>
          <code class="skill-preview-id">${input.skillId}</code>
        </div>
        <div class="skill-preview-body">${renderMessageContent(input.content)}</div>
      </div>
    </div>
  `;
}

function renderToolCard(toolCallId, toolCards) {
  const card = toolCards?.get(toolCallId);
  if (!card) return nothing;
  const { toolName, state, input } = card;
  if (state === TOOL_STATE.APPROVAL_REQUESTED) {
    if (toolName === 'da_create_skill') return renderSkillPreview(input);
    return nothing;
  }
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

function renderMessage(msg, icons, toolCards) {
  if (msg.role === ROLE.TOOL) return nothing;
  const isAssistant = msg.role === ROLE.ASSISTANT;

  // Assistant message with tool-call parts (array content)
  if (isAssistant && Array.isArray(msg.content)) {
    return html`${msg.content.map((part) => (part.type === AGENT_EVENT.TOOL_CALL
      ? renderToolCard(part.toolCallId, toolCards)
      : nothing))}`;
  }

  const copy = isAssistant && !msg.streaming
    ? html`<button class="message-action-copy" @click=${() => navigator.clipboard.writeText(msg.content)} aria-label="Copy">
      </button>`
    : nothing;

  return html`
    <div class="message message-${msg.role}">
      <div class="message-content">${isAssistant ? renderMessageContent(msg.content) : msg.content}</div>
      ${copy}
    </div>
  `;
}

export { renderMessage, renderApprovalCard };

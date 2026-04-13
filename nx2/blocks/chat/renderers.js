import { html, nothing } from 'da-lit';
import { unified, remarkParse } from '../../deps/mdast/dist/index.js';

function renderNode(node) {
  switch (node.type) {
    case 'root':
      return node.children.map(renderNode);
    case 'paragraph':
      return html`<p>${node.children.map(renderNode)}</p>`;
    case 'heading':
      return html`<h${node.depth}>${node.children.map(renderNode)}</h${node.depth}>`;
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
    case 'link':
      return html`<a href="${node.url}" target="_blank" rel="noopener noreferrer">${node.children.map(renderNode)}</a>`;
    case 'text':
      return node.value;
    default:
      return nothing;
  }
}

const parser = unified().use(remarkParse);

function renderMessageContent(text) {
  if (!text) return nothing;
  const tree = parser.parse(text);
  return renderNode(tree);
}

export function renderThinking() {
  return html`
    <div class="chat-thinking">
      <span></span><span></span><span></span>
      <span class="chat-thinking-label">Thinking...</span>
    </div>
  `;
}

export function renderMessage(msg, icons) {
  if (msg.role === 'tool') return nothing;
  const isAssistant = msg.role === 'assistant';
  const copy = isAssistant && !msg.streaming
    ? html`<button class="message-action-copy" @click=${() => navigator.clipboard.writeText(msg.content)} aria-label="Copy">
        ${icons?.copy?.cloneNode(true)}
      </button>`
    : nothing;
  return html`
    <div class="message message-${msg.role}">
      <div class="message-content">${isAssistant ? renderMessageContent(msg.content) : msg.content}</div>
      ${copy}
    </div>
  `;
}

import { html, nothing } from 'da-lit';
import { getConfig } from '../../../scripts/nx.js';

const { codeBase } = getConfig();

export function getResponseCopies({ messages = [], thinking } = {}) {
  const responses = [{ parts: [] }];
  messages.forEach((message, index) => {
    if (message.role === 'user') {
      responses.push({ parts: [] });
      return;
    }
    const response = responses.at(-1);
    response.lastIndex = index;
    response.streaming ||= message.streaming;
    if (message.role === 'assistant' && typeof message.content === 'string'
      && message.content.trim() && !message.toolCall && !message.toolCard
      && !message.uiArtifact && !message.questionResponse) {
      response.parts.push(message.content);
    }
  });
  return new Map(responses.flatMap((response, index) => {
    if (!response.parts.length || response.streaming
      || (thinking && index === responses.length - 1)) return [];
    return [[response.lastIndex, response.parts.join('\n\n')]];
  }));
}

export function renderCopyButton(content, { streaming } = {}) {
  if (streaming) return nothing;
  return html`
    <button class="message-action-copy" @click=${() => navigator.clipboard.writeText(content)} aria-label="Copy">
      <svg class="icon-paste" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-paste-20-n.svg#icon"></use></svg>
      <svg class="icon-checkmark" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-checkmark-20-n.svg#icon"></use></svg>
    </button>
  `;
}

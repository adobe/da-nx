import { html, nothing } from 'da-lit';
import { getConfig } from '../../../scripts/nx.js';

const { codeBase } = getConfig();

export function renderCopyButton(content, { streaming } = {}) {
  if (streaming) return nothing;
  return html`
    <button class="message-action-copy" @click=${() => navigator.clipboard.writeText(content)} aria-label="Copy">
      <svg class="icon-paste" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-paste-20-n.svg#icon"></use></svg>
      <svg class="icon-checkmark" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-checkmark-20-n.svg#icon"></use></svg>
    </button>
  `;
}

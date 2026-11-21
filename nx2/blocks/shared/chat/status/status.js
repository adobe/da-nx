import { html, nothing } from 'da-lit';
import { loadStyle } from '../../../../utils/utils.js';

export const chatStatusStyle = await loadStyle(import.meta.url);

export function renderChatStatus({
  status, title, description, actionLabel, onAction,
}) {
  return html`
    <div class="chat-status" role="status" aria-busy=${status === 'checking'}>
      ${status === 'checking' ? html`<span class="nx-loading-spinner" aria-hidden="true"></span>` : nothing}
      <h3>${title}</h3>
      ${description ? html`<p>${description}</p>` : nothing}
      ${actionLabel && onAction ? html`
        <button type="button" class="nx-action-btn" @click=${onAction}>${actionLabel}</button>
      ` : nothing}
    </div>
  `;
}

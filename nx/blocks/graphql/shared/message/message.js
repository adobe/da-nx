import { html, nothing } from 'da-lit';
import { loadStyle } from '../../../../../nx2/utils/utils.js';

export const messageStyle = await loadStyle(import.meta.url);

// A centered full-page message with one action, e.g. for an empty or missing context.
export function renderMessage({
  heading, text, action, onAction, role,
}) {
  return html`
    <section class="message" role=${role ?? nothing}>
      <h2>${heading}</h2>
      <p>${text}</p>
      <sl-button class="primary outline" @click=${onAction}>${action}</sl-button>
    </section>`;
}

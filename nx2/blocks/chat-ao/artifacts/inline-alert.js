import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';

const VARIANTS = new Set(['informative', 'positive', 'notice', 'negative', 'neutral']);

registerArtifact('InlineAlert', ({
  variant = 'informative', title = '', description = '',
}) => {
  if (!VARIANTS.has(variant) || typeof title !== 'string' || typeof description !== 'string') {
    throw new Error('Unsupported InlineAlert content.');
  }
  return html`
    <div class="ui-artifact-alert ui-artifact-alert-${variant}">
      <span class="ui-artifact-alert-icon" aria-hidden="true"></span>
      <div class="ui-artifact-alert-body">
        <p class="ui-artifact-alert-text">${title ? html`<strong>${title}</strong> ` : nothing}${description}</p>
      </div>
    </div>
  `;
});

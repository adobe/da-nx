import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';

registerArtifact('Divider', ({ orientation = 'horizontal', visible = true }) => {
  if (!['horizontal', 'vertical'].includes(orientation) || typeof visible !== 'boolean') {
    throw new Error('Unsupported Divider content.');
  }
  if (!visible) return nothing;
  return html`<div class="ui-artifact-divider" role="separator" aria-orientation=${orientation}></div>`;
});

import { html, nothing } from 'da-lit';
import { registerArtifact, renderChildren } from './registry.js';

registerArtifact('Tile', ({
  title = '', description = '', visible = true, children, ...unsupported
}, ctx) => {
  if (typeof title !== 'string' || typeof description !== 'string'
    || typeof visible !== 'boolean' || !Array.isArray(children) || children.length !== 1
    || Object.keys(unsupported).length) {
    throw new Error('Unsupported Tile content.');
  }
  if (!visible) return nothing;
  return html`
    <div class="ui-artifact-card ui-artifact-tile">
      ${title ? html`<h3 class="ui-artifact-tile-title">${title}</h3>` : nothing}
      ${description ? html`<p class="ui-artifact-tile-description">${description}</p>` : nothing}
      ${renderChildren(children, ctx)}
    </div>
  `;
});

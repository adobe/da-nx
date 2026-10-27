import { html, nothing } from 'da-lit';
import { registerArtifact, renderChildren } from './registry.js';

const LAYOUT_FIELDS = ['x', 'y', 'w', 'h'];

registerArtifact('Tile', ({
  title = '', description = '', visible = true, children, layout, grow, ...unsupported
}, ctx) => {
  const validLayout = layout === undefined || (
    layout && typeof layout === 'object' && !Array.isArray(layout)
    && LAYOUT_FIELDS.every((key) => Number.isFinite(layout[key]))
    && Object.keys(layout).every((key) => LAYOUT_FIELDS.includes(key))
  );
  if (typeof title !== 'string' || typeof description !== 'string'
    || typeof visible !== 'boolean' || !Array.isArray(children) || children.length !== 1
    || !validLayout || (grow !== undefined && typeof grow !== 'boolean')
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

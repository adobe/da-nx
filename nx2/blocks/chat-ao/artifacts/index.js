import { html, nothing } from 'da-lit';
import {
  isFlatRecord, renderArtifactNode, renderFallback,
} from './registry.js';
import './markdown.js';
import './row.js';
import './column.js';
import './card.js';
import './data-table.js';
import './metric-card.js';
import './page-evaluation.js';
import './code-block.js';
import './alert.js';

// Flat A2UI surfaces render from the `root` record, which reaches the rest by
// id; legacy nested surfaces render every top-level node.
function renderComponents(components, textFallback) {
  if (!components.some(isFlatRecord)) {
    return components.map((c) => renderArtifactNode(c, textFallback));
  }
  const recordsById = new Map(components.map((c) => [c.id, c]));
  const root = recordsById.get('root') ?? components[0];
  return renderArtifactNode(root, textFallback, { recordsById });
}

export function renderUiArtifact(uiArtifact) {
  if (!uiArtifact) return nothing;
  const { components, textFallback, title } = uiArtifact;
  if (!components?.length) {
    return textFallback ? renderFallback(textFallback) : nothing;
  }
  return html`
    <div class="ui-artifact">
      ${title ? html`<span class="ui-artifact-title">${title}</span>` : nothing}
      ${renderComponents(components, textFallback)}
    </div>
  `;
}

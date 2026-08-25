import { html, nothing } from 'da-lit';
import { renderArtifactNode, renderFallback } from './registry.js';
import './markdown.js';
import './row.js';
import './column.js';
import './card.js';
import './data-table.js';
import './metric-card.js';
import './code-block.js';
import './alert.js';

export function renderUiArtifact(uiArtifact) {
  if (!uiArtifact) return nothing;
  const { components, textFallback, title } = uiArtifact;
  if (!components?.length) {
    return textFallback ? renderFallback(textFallback) : nothing;
  }
  return html`
    <div class="ui-artifact">
      ${title ? html`<span class="ui-artifact-title">${title}</span>` : nothing}
      ${components.map((c) => renderArtifactNode(c, textFallback))}
    </div>
  `;
}

import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';

const VARIANTS = new Set(['accent', 'informative', 'neutral', 'positive', 'notice', 'negative']);
const FILLS = new Set(['bold', 'outline', 'subtle']);
const SIZES = new Set(['S', 'M', 'L', 'XL']);

registerArtifact('Badge', ({
  label, variant = 'neutral', fillStyle = 'bold', size = 'M', visible = true,
}) => {
  if (typeof label !== 'string' || !label.trim() || !VARIANTS.has(variant)
    || !FILLS.has(fillStyle) || !SIZES.has(size) || typeof visible !== 'boolean') {
    throw new Error('Unsupported Badge content.');
  }
  if (!visible) return nothing;
  return html`
    <span class="ui-artifact-badge ui-artifact-badge-${variant}"
      data-fill=${fillStyle} data-size=${size}>${label}</span>
  `;
});

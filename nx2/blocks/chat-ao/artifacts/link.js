import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';
import { isSafeHref } from '../../chat/utils/links.js';

const VARIANTS = new Set(['primary', 'secondary']);

registerArtifact('Link', ({
  label, href, variant = 'primary', isQuiet = false, openInNewTab = true,
  isStandalone = false, action, visible = true,
}) => {
  if (typeof label !== 'string' || !label.trim() || !isSafeHref(href)
    || !VARIANTS.has(variant) || typeof isQuiet !== 'boolean'
    || typeof openInNewTab !== 'boolean' || typeof isStandalone !== 'boolean'
    || typeof visible !== 'boolean' || action !== undefined) {
    throw new Error('Unsupported Link content.');
  }
  if (!visible) return nothing;
  return html`
    <a class="ui-artifact-link" href=${href}
      target=${openInNewTab ? '_blank' : '_self'} rel="noopener noreferrer"
      data-variant=${variant} data-quiet=${isQuiet} data-standalone=${isStandalone}
    >${label}</a>
  `;
});

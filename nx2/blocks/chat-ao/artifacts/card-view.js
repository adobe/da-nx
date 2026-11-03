import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';
import { isSafeHref } from '../../chat/utils/links.js';

const SIZES = new Set(['XS', 'S', 'M', 'L', 'XL']);
const ITEM_FIELDS = new Set(['id', 'title', 'description', 'imageSrc']);

registerArtifact('CardView', ({
  label = '', size = 'XS', selectionMode = 'none', items,
}) => {
  if (typeof label !== 'string' || !SIZES.has(size) || selectionMode !== 'none'
    || !Array.isArray(items) || items.some((item) => (
    !item || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string'
      || (item.description !== undefined && typeof item.description !== 'string')
      || (item.imageSrc !== undefined && !isSafeHref(item.imageSrc))
      || Object.keys(item).some((key) => !ITEM_FIELDS.has(key))
  ))) {
    throw new Error('Unsupported CardView content.');
  }
  return html`
    <div class="ui-artifact-card-view" data-size="XS">
      ${label ? html`<h3 class="ui-artifact-card-view-label">${label}</h3>` : nothing}
      <ul class="ui-artifact-card-view-list" aria-label=${label || nothing}>
        ${items.map((item) => html`
          <li class="ui-artifact-card-view-item">
            ${item.imageSrc ? html`
              <img class="ui-artifact-card-view-image" src=${item.imageSrc}
                alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
            ` : nothing}
            <h4 class="ui-artifact-card-view-title" title=${item.title}>${item.title}</h4>
            ${item.description ? html`<p class="ui-artifact-card-view-description" title=${item.description}>${item.description}</p>` : nothing}
          </li>
        `)}
      </ul>
    </div>
  `;
});

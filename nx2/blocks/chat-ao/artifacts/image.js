import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';
import { isSafeHref } from '../../chat/utils/links.js';

const FITS = new Set(['contain', 'cover', 'fill', 'none', 'scale-down']);
const validDimension = (value) => value === undefined || (Number.isFinite(value) && value > 0);

registerArtifact('Image', ({
  src, alt = '', width, height, fit = 'contain', visible = true,
}) => {
  if (!isSafeHref(src) || typeof alt !== 'string' || !FITS.has(fit)
    || !validDimension(width) || !validDimension(height) || typeof visible !== 'boolean') {
    throw new Error('Unsupported Image content.');
  }
  if (!visible) return nothing;
  const style = [
    `object-fit: ${fit}`,
    ...(width === undefined ? [] : [`width: ${width}px`]),
    ...(height === undefined ? [] : [`height: ${height}px`]),
  ].join('; ');
  return html`
    <img class="ui-artifact-image" src=${src} alt=${alt}
      width=${width ?? nothing} height=${height ?? nothing} style=${style}
      loading="lazy" decoding="async" referrerpolicy="no-referrer">
  `;
});

import { html, nothing } from 'da-lit';
import { loadStyle } from '../../../../../nx2/utils/utils.js';

// Spectrum 2 status light: https://spectrum.adobe.com/page/status-light/
export const statusLightStyle = await loadStyle(import.meta.url);

// variant: positive, notice, negative or neutral.
export function renderStatusLight({ variant = 'neutral', label, title }) {
  return html`<span class="status-light ${variant}" title=${title ?? nothing}>${label}</span>`;
}

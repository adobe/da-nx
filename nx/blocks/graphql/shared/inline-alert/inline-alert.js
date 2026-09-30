import { html, nothing } from 'da-lit';
import { loadStyle } from '../../../../../nx2/utils/utils.js';
import { icon } from '../icons.js';

// Spectrum 2 in-line alert (border style): https://spectrum.adobe.com/page/in-line-alert/
export const inlineAlertStyle = await loadStyle(import.meta.url);

const ICONS = {
  informative: { name: 'info', label: 'Information' },
  negative: { name: 'alert', label: 'Error' },
};

const renderIcon = (variant) => icon({ ...ICONS[variant], className: 'inline-alert-icon' });

export function renderInlineAlert({
  variant, heading, content = nothing, className = '', role = 'status',
}) {
  return html`
    <div class="inline-alert ${variant} ${className}" role=${role}>
      ${renderIcon(variant)}
      <p class="inline-alert-heading">${heading}</p>
      <div class="inline-alert-content">${content}</div>
    </div>`;
}

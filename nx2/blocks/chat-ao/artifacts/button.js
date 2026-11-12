import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';
import { isSafeHref } from '../../chat/utils/links.js';

const VARIANTS = new Set(['accent', 'genai', 'negative', 'premium', 'primary', 'secondary']);
const ICONS = {
  Add: 'M10 4v12M4 10h12',
  RocketQuickActions: 'M7 13 4 16m4-4L5 9l8-5h3v3l-5 8-3-3ZM11 9l1-1',
  AlertTriangle: 'M10 3 2 17h16L10 3Zm0 5v4m0 2v1',
  Calendar: 'M3 5h14v12H3V5Zm3-2v4m8-4v4M3 9h14',
  Checkmark: 'm4 10 4 4 8-8',
  Close: 'm5 5 10 10M5 15 15 5',
  Delete: 'M3 5h14M8 5V3h4v2M5 5l1 12h8l1-12M8 8v6m4-6v6',
  Download: 'M10 3v10m-4-4 4 4 4-4M3 14v3h14v-3',
  Edit: 'm4 12 9-9 4 4-9 9-5 1 1-5Zm7-7 4 4',
  Folder: 'M2 5h6l2 2h8v10H2V5Z',
  InfoCircle: 'M10 6v1m0 2v5M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z',
  Layers: 'm2 7 8-4 8 4-8 4-8-4Zm0 4 8 4 8-4M2 15l8 4 8-4',
  More: 'M4 10h1m4 0h1m4 0h1',
  OpenIn: 'M11 3h6v6m0-6-9 9M8 3H3v14h14v-5',
  Star: 'm10 2 2.5 5 5.5 1-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1L10 2Z',
  User: 'M6 6a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM3 18v-2a7 5 0 0 1 14 0v2',
  ViewGrid: 'M3 3h5v5H3V3Zm9 0h5v5h-5V3ZM3 12h5v5H3v-5Zm9 0h5v5h-5v-5Z',
  ViewList: 'M3 4h3v3H3V4Zm0 9h3v3H3v-3Zm6-8h8M9 14h8',
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateAction(action) {
  if (action === undefined) return;
  if (!isRecord(action) || Object.keys(action).some((key) => key !== 'event')
    || !isRecord(action.event) || typeof action.event.name !== 'string' || !action.event.name.trim()
    || Object.keys(action.event).some((key) => !['name', 'context'].includes(key))) {
    throw new Error('Unsupported button action.');
  }
  const { context } = action.event;
  if (context !== undefined && (!isRecord(context) || Object.values(context).some((ref) => (
    !isRecord(ref) || typeof ref.path !== 'string' || !ref.path.startsWith('/')
    || Object.keys(ref).some((key) => key !== 'path')
  )))) {
    throw new Error('Unsupported action context.');
  }
}

function renderButton({
  label = '', ariaLabel, variant = 'primary', isDisabled = false, icon,
  type = 'button', action, href, openInNewTab = false, tooltip, visible = true,
  notificationBadge,
}, ctx, isActionButton) {
  if (typeof label !== 'string' || (ariaLabel !== undefined && typeof ariaLabel !== 'string')
    || !(ariaLabel || label).trim() || !VARIANTS.has(variant)
    || typeof isDisabled !== 'boolean' || typeof visible !== 'boolean'
    || typeof openInNewTab !== 'boolean' || type !== 'button'
    || (tooltip !== undefined && typeof tooltip !== 'string')
    || (icon !== undefined && (typeof icon !== 'string' || !Object.hasOwn(ICONS, icon)))
    || (href !== undefined && (isActionButton || !isSafeHref(href) || action !== undefined))
    || (notificationBadge !== undefined && (!isActionButton
      || !Number.isInteger(notificationBadge) || notificationBadge < 0))) {
    throw new Error('Unsupported button content.');
  }
  validateAction(action);
  if (!visible) return nothing;
  const className = `ui-artifact-button ${isActionButton ? 'nx-action-btn-quiet' : ({
    accent: 'nx-btn-accent',
    primary: 'nx-btn-primary',
  }[variant] ?? 'nx-action-btn')} ui-artifact-button-${variant}`;
  const content = html`
    ${icon ? html`<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor"
      stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d=${ICONS[icon]}></path></svg>` : nothing}
    ${label}
    ${notificationBadge !== undefined ? html`<span class="ui-artifact-button-badge">${notificationBadge}</span>` : nothing}
  `;
  if (href !== undefined && !isDisabled) {
    return html`<a class=${className} href=${href} target=${openInNewTab ? '_blank' : '_self'}
      rel="noopener noreferrer" aria-label=${ariaLabel ?? nothing} title=${tooltip ?? nothing}>${content}</a>`;
  }
  const disabled = isDisabled || !action || typeof ctx.onAction !== 'function'
    || (ctx.actionNames !== undefined && !ctx.actionNames.includes(action.event.name));
  return html`<button class=${className} type="button" ?disabled=${disabled}
    aria-label=${ariaLabel ?? nothing} title=${tooltip ?? nothing}
    @click=${() => {
    if (disabled) return;
    ctx.onAction({
      artifactId: ctx.artifactId,
      componentId: ctx.componentId,
      name: action.event.name,
      context: structuredClone(action.event.context ?? {}),
    });
  }}>${content}</button>`;
}

registerArtifact('Button', (props, ctx) => renderButton(props, ctx, false));
registerArtifact('ActionButton', (props, ctx) => renderButton(props, ctx, true));

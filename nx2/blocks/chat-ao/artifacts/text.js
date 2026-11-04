import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';

const STYLES = new Set(['ui', 'heading', 'title', 'body', 'detail', 'code']);
const SIZES = new Set(['2xs', 'xs', 'sm', 'lg', 'xl', '2xl', '3xl']);
const WRAPS = new Set(['normal', 'pre', 'truncate']);
const ELEMENTS = {
  p: ({ text, className, size, wrap }) => html`
    <p class=${className} data-size=${size} data-wrap=${wrap}>${text}</p>`,
  span: ({ text, className, size, wrap }) => html`
    <span class=${className} data-size=${size} data-wrap=${wrap}>${text}</span>`,
  div: ({ text, className, size, wrap }) => html`
    <div class=${className} data-size=${size} data-wrap=${wrap}>${text}</div>`,
  label: ({ text, className, size, wrap }) => html`
    <label class=${className} data-size=${size} data-wrap=${wrap}>${text}</label>`,
  code: ({ text, className, size, wrap }) => html`
    <code class=${className} data-size=${size} data-wrap=${wrap}>${text}</code>`,
  h1: ({ text, className, size, wrap }) => html`
    <h1 class=${className} data-size=${size} data-wrap=${wrap}>${text}</h1>`,
  h2: ({ text, className, size, wrap }) => html`
    <h2 class=${className} data-size=${size} data-wrap=${wrap}>${text}</h2>`,
  h3: ({ text, className, size, wrap }) => html`
    <h3 class=${className} data-size=${size} data-wrap=${wrap}>${text}</h3>`,
  h4: ({ text, className, size, wrap }) => html`
    <h4 class=${className} data-size=${size} data-wrap=${wrap}>${text}</h4>`,
  h5: ({ text, className, size, wrap }) => html`
    <h5 class=${className} data-size=${size} data-wrap=${wrap}>${text}</h5>`,
  h6: ({ text, className, size, wrap }) => html`
    <h6 class=${className} data-size=${size} data-wrap=${wrap}>${text}</h6>`,
};

registerArtifact('Text', ({
  text, style = 'body', size, type, wrap = 'normal', visible = true,
}) => {
  const tag = type === undefined
    ? ({ heading: 'h3', title: 'h3', code: 'code' }[style] ?? 'p')
    : type;
  if (typeof text !== 'string' || !STYLES.has(style)
    || (size !== undefined && !SIZES.has(size)) || !WRAPS.has(wrap)
    || typeof tag !== 'string' || !Object.hasOwn(ELEMENTS, tag)
    || typeof visible !== 'boolean') {
    throw new Error('Unsupported Text content.');
  }
  if (!visible) return nothing;
  return ELEMENTS[tag]({
    text,
    className: `ui-artifact-text ui-artifact-text-${style}`,
    size: size ?? nothing,
    wrap,
  });
});

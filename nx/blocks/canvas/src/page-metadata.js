/**
 * Page metadata panel: parses and displays section-metadata blocks from the editor's
 * plain HTML (same source as page outline). Each block uses k/v rows: two divs (key,
 * value).
 */
// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';

const style = await getStyle(import.meta.url);

/**
 * Extract key/value pairs from a section-metadata block. Each direct child div has two
 * divs: key, value.
 * @param {Element} el
 * @returns {{ key: string, value: string }[]}
 */
function getKeyValues(el) {
  if (!el || !el.children) return [];
  return [...el.children]
    .filter((row) => row.children && row.children.length >= 2)
    .map((row) => ({
      key: row.children[0].textContent?.trim() ?? '',
      value: row.children[1].textContent?.trim() ?? '',
    }));
}

/**
 * Parse HTML for all .section-metadata blocks.
 * @param {string} htmlText
 * @returns Array of key/value arrays, one per section-metadata block.
 */
function parseMetadataFromHtml(htmlText) {
  const result = [];
  if (!htmlText || typeof htmlText !== 'string' || !htmlText.trim()) return result;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const container = doc.querySelector('main') || doc.body;
    if (!container) return result;

    const sectionMetaEls = container.querySelectorAll('.section-metadata');
    sectionMetaEls.forEach((el) => {
      result.push(getKeyValues(el));
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[page-metadata] parseMetadataFromHtml failed', e?.message);
  }
  return result;
}

export default class PageMetadata extends LitElement {
  static properties = {
    plainHtml: { type: String },
    _parsed: { state: true },
  };

  constructor() {
    super();
    this.plainHtml = '';
    this._parsed = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated(changed) {
    super.updated?.(changed);
    if (changed.has('plainHtml')) {
      this._parsed = parseMetadataFromHtml(this.plainHtml ?? '');
    }
  }

  /* eslint-disable-next-line class-methods-use-this */
  renderKeyValueTable(rows) {
    if (!rows?.length) return nothing;
    return html`
      <table class="page-metadata-table">
        ${rows.map((row) => html`
          <tr>
            <th>${row.key}</th>
            <td>${row.value}</td>
          </tr>
        `)}
      </table>
    `;
  }

  render() {
    const sectionBlocks = this._parsed.filter((arr) => arr.length > 0);
    const hasSection = sectionBlocks.length > 0;

    if (!hasSection) {
      return html`
        <div class="page-metadata">
          <p class="page-metadata-header">Metadata</p>
          <div class="page-metadata-scroll">
            <p class="page-metadata-empty">No section metadata on this page.</p>
          </div>
        </div>
      `;
    }

    return html`
      <div class="page-metadata">
        <p class="page-metadata-header">Metadata</p>
        <div class="page-metadata-scroll">
          ${sectionBlocks.map((rows, i) => html`
            <section class="page-metadata-section">
              <span class="page-metadata-section-title">Section metadata${sectionBlocks.length > 1 ? ` ${i + 1}` : ''}</span>
              ${this.renderKeyValueTable(rows)}
            </section>
          `)}
        </div>
      </div>
    `;
  }
}

customElements.define('da-page-metadata', PageMetadata);

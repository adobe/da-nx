// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';

const style = await getStyle(import.meta.url);

/**
 * Reads `value` from `sp-search` / `sp-textfield` in the event path, or falls back to target.
 * @param {Event} event - Input or change from the search control subtree.
 * @returns {string} Normalized string value.
 */
export function readSearchControlValueFromInputEvent(event) {
  for (const node of event.composedPath()) {
    const element = /** @type {unknown} */ (node);
    if (!(element instanceof Element) || !element.localName) {
      /* keep walking */
    } else if
    (
      (element.localName === 'sp-search' || element.localName === 'sp-textfield')
      && 'value' in /** @type {object} */ (element)
    ) {
      const rawValue = /** @type {{ value: unknown }} */ (element).value;
      return typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
    }
  }
  const targetInput = /** @type {HTMLInputElement | undefined} */ (event.target);
  const fallbackValue = targetInput?.value;
  return typeof fallbackValue === 'string' ? fallbackValue : '';
}

/**
 * Debounced search control; forwards typed text as `sl-search-change`.
 * @fires sl-search-change - detail: { value: string }
 * @fires sl-search-file-contents-change - detail: { value: boolean }
 * @customElement sl-browse-search
 */
export class SlBrowseSearch extends LitElement {
  static properties = {
    /** Current query string (two-way with `sp-search`). */
    value: { type: String },
    placeholder: { type: String },
    label: { type: String },
    /** When true, parent may scan file bodies (slower). Two-way with `sp-switch`. */
    searchFileContents: { type: Boolean, attribute: 'search-file-contents' },
    /** Delay before emitting after input (ms). */
    debounceMs: { type: Number, attribute: 'debounce-ms' },
  };

  constructor() {
    super();
    this.value = '';
    this.placeholder = 'Search in this folder and below';
    this.label = 'Search';
    this.searchFileContents = false;
    this.debounceMs = 200;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._debounceTimerId = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    if (this._debounceTimerId) clearTimeout(this._debounceTimerId);
    super.disconnectedCallback();
  }

  /**
   * Clears pending debounce when `value` is set from outside.
   * @param {Map<string | number | symbol, unknown>} changedProperties - Lit change map.
   */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('value') && this._debounceTimerId) {
      clearTimeout(this._debounceTimerId);
      this._debounceTimerId = null;
    }
  }

  /**
   * Notifies listeners of the latest query string.
   * @param {string} query - Debounced search text.
   */
  emitSearchChangeEvent(query) {
    this.dispatchEvent(
      new CustomEvent('sl-search-change', {
        detail: { value: query },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Suppresses native form GET when `sp-search` submits on Enter.
   * @param {SubmitEvent} event - Wrapped form submit.
   */
  _preventWrappedFormSubmit(event) {
    event.preventDefault();
  }

  /**
   * @param {Event} event - `change` from `sp-switch`.
   */
  _onFileContentsChange(event) {
    const { target } = event;
    const checked = !!(/** @type {HTMLElement & { checked?: boolean }} */ (target)?.checked);
    if (this.searchFileContents === checked) return;
    this.searchFileContents = checked;
    this.dispatchEvent(
      new CustomEvent('sl-search-file-contents-change', {
        detail: { value: checked },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Debounces input and updates `value` plus {@link emitSearchChangeEvent}.
   * @param {Event} event - Input from `sp-search`.
   */
  _handleSearchInput(event) {
    const nextValue = readSearchControlValueFromInputEvent(event);
    if (this._debounceTimerId) clearTimeout(this._debounceTimerId);
    this._debounceTimerId = setTimeout(() => {
      this._debounceTimerId = null;
      this.value = nextValue;
      this.emitSearchChangeEvent(nextValue);
    }, this.debounceMs);
  }

  /** Wraps Spectrum `sp-search` for full width and debounced change events. */
  render() {
    return html`
      <div class="sl-search-shell">
        <sp-search
          class="sl-browse-search-control"
          size="m"
          placeholder="${this.placeholder}"
          label="${this.label}"
          .value="${this.value}"
          @input="${this._handleSearchInput}"
          @submit="${this._preventWrappedFormSubmit}"
        ></sp-search>
        <sp-switch
          class="sl-search-file-contents"
          size="m"
          ?emphasized="${true}"
          ?checked="${this.searchFileContents}"
          @change="${this._onFileContentsChange}"
        >
          Full-text search
        </sp-switch>
      </div>
    `;
  }
}

if (!customElements.get('sl-browse-search')) {
  customElements.define('sl-browse-search', SlBrowseSearch);
}

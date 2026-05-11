import { LitElement, html } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'sc-preview';
const REFRESH_MS = 500;

class Preview extends LitElement {
  static properties = {
    state: { attribute: false },
    _text: { state: true },
  };

  constructor() {
    super();
    this._text = '';
    this._refreshTimer = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = null;
    super.disconnectedCallback();
  }

  updated(changed) {
    if (!changed.has('state')) return;

    // Render the first state synchronously so the preview is never blank.
    // After that, debounce — the expensive JSON.stringify only runs once the
    // user pauses typing.
    if (changed.get('state') === undefined) {
      this._text = this._stringify();
      return;
    }

    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      this._text = this._stringify();
    }, REFRESH_MS);
  }

  _stringify() {
    return JSON.stringify(this.state?.document?.values ?? {}, null, 2);
  }

  render() {
    return html`
      <div class="vis-wrapper is-visible">
        <p class="sc-title">Preview</p>
        <pre><code>${this._text}</code></pre>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, Preview);
}

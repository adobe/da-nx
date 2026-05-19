import { LitElement, html } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'nx-preview';
const REFRESH_MS = 500;

// Lazy-load Prism only once across the page lifetime. The preview is the only
// place that uses it, and loading it on demand keeps it off the critical path.
let prismLoading;
async function loadPrism() {
  if (window.Prism) return window.Prism;
  if (!prismLoading) {
    prismLoading = (async () => {
      await import('../deps/prism.js');
      await import('../deps/prism-json.min.js');
      return window.Prism;
    })();
  }
  return prismLoading;
}

class Preview extends LitElement {
  static properties = {
    state: { attribute: false },
  };

  _refreshTimer = null;

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
      this._paint();
      return;
    }

    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      this._paint();
    }, REFRESH_MS);
  }

  // Prism rewrites the inside of <code> into highlighted <span>s. If we let
  // Lit interpolate `${this._text}` into that element, the next render would
  // try to update a child node Prism already replaced and would either throw
  // or no-op silently. We render an EMPTY <code> via Lit and own the text
  // content imperatively from here on.
  async _paint() {
    const code = this.shadowRoot?.querySelector('code');
    if (!code) return;
    code.textContent = JSON.stringify(this.state?.document?.values ?? {}, null, 2);
    const Prism = await loadPrism();
    if (Prism) Prism.highlightElement(code);
  }

  render() {
    return html`
      <div class="vis-wrapper is-visible">
        <p class="nx-title">Preview</p>
        <pre><code class="language-json"></code></pre>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, Preview);
}

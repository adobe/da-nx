import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';

const style = await loadStyle(import.meta.url);

const EL_NAME = 'nx-preview';
const REFRESH_MS = 500;

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
    open: { type: Boolean, reflect: true },
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
    if (!this.open) return;

    if (changed.has('open')) {
      this._paint();
      return;
    }

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

  // Owns <code>'s contents imperatively: Prism mutates the element, so Lit
  // template interpolation inside it would fight the highlighter on every paint.
  async _paint() {
    const code = this.shadowRoot?.querySelector('code');
    if (!code) return;
    code.textContent = JSON.stringify(this.state?.document ?? {}, null, 2);
    const Prism = await loadPrism();
    if (Prism) Prism.highlightElement(code);
  }

  _toggle() {
    this.open = !this.open;
  }

  render() {
    return html`
      <div class="vis-wrapper is-visible">
        <button
          type="button"
          class="nx-title"
          aria-expanded=${this.open ? 'true' : 'false'}
          @click=${this._toggle}
        >
          <svg class="nx-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Preview
        </button>
        ${this.open ? html`<pre><code class="language-json"></code></pre>` : nothing}
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, Preview);
}

import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
await loadStyle(`${nx}/public/sl/styles.css`);
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxWorkspace extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
  }

  render() {
    return html`
      <div class="workspace">
        <div class="workspace-hero"></div>
        <div class="workspace-sections"></div>
      </div>
    `;
  }
}

customElements.define('nx-workspace', NxWorkspace);

export default async function init(el) {
  const workspace = document.createElement('nx-workspace');
  document.body.append(workspace);
  el.remove();
}

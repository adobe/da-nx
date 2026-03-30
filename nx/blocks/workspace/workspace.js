import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import '../canvas/src/chat.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
await loadStyle(`${nx}/public/sl/styles.css`);
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxWorkspace extends LitElement {
  static properties = {
    _ims: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
  }

  _renderHero() {
    const firstName = this._ims?.first_name ?? this._ims?.displayName?.split(' ')[0];
    const title = firstName ? 'Your AI-powered content workspace' : 'Your AI-powered content workspace';

    return html`
      <div class="workspace-hero">
        <div class="workspace-hero-text">
          ${firstName ? html`<p class="workspace-welcome-label">Welcome back</p>` : ''}
          <h1 class="workspace-hero-title">
            ${firstName ? html`Welcome, <strong>${firstName}</strong>!` : title}
          </h1>
        </div>
        <div class="workspace-chat-container">
          <da-chat
            context-view="workspace"
            .onPageContextItems="${[]}"
          ></da-chat>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="workspace">
        ${this._renderHero()}
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

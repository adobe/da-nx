import { LitElement, html } from 'da-lit';
import { loadStyle, loadScript } from '../../../../../nx2/utils/utils.js';

const style = await loadStyle(import.meta.url);

let makeConfetti;

class NxLocComplete extends LitElement {
  static properties = { project: { attribute: false } };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.loadConfetti();
  }

  async loadConfetti() {
    if (window.confetti) {
      makeConfetti();
      return;
    }
    await loadScript(`${import.meta.url.replace('complete.js', 'confetti.js')}`);
    makeConfetti = (await import('./index.js')).default;
    makeConfetti();
  }

  handleClick() {
    window.location.hash = `/dashboard/${this.project.org}/${this.project.site}`;
  }

  render() {
    return html`
      <div class="inner">
        <svg viewBox="0 0 20 20"><use href="/img/icons/s2-icon-emoji-20-n.svg#icon" /></svg>
        <h1>You're all done!</h1>
        <sl-button @click=${this.handleClick} class="accent">Go to dashboard</sl-button>
      </div>
    `;
  }
}

customElements.define('nx-loc-complete', NxLocComplete);

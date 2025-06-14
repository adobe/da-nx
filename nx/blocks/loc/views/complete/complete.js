import { LitElement, html } from 'da-lit';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import loadScript from '../../../../utils/script.js';

const style = await getStyle(import.meta.url);

const { nxBase: nx } = getConfig();

const ICONS = [
  `${nx}/public/icons/S2_Icon_Emoji_20_N.svg`,
];

let makeConfetti;

class NxLocComplete extends LitElement {
  static properties = { project: { attribute: false } };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
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
        <svg viewBox="0 0 20 20"><use href="#S2_Icon_Emoji_20_N" /></svg>
        <h1>You're all done!</h1>
        <sl-button @click=${this.handleClick} class="accent">Go to dashboard</sl-button>
      </div>
    `;
  }
}

customElements.define('nx-loc-complete', NxLocComplete);

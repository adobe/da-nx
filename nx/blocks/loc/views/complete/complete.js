import { LitElement, html } from 'da-lit';
import config from '../../../../../nx2/utils/nxToggle.js';
import { loadStyle, loadScript } from '../../../../../nx2/utils/utils.js';
import loadIcons from '../../../../../nx2/utils/svg.js';

const style = await loadStyle(import.meta.url);

const { nxBase: nx } = config;

const ICONS = [
  `${nx}/public/icons/S2_Icon_Emoji_20_N.svg`,
];
const icons = await loadIcons({ paths: ICONS });

let makeConfetti;

class NxLocComplete extends LitElement {
  static properties = { project: { attribute: false } };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.shadowRoot.append(...icons);
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

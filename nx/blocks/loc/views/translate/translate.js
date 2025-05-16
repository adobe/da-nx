import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getSvg from '../../../../utils/svg.js';
import { Queue } from '../../../../public/utils/tree.js';

const { nxBase: nx } = getConfig();

const style = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/public/icons/S2_Icon_CheckmarkCircleGreen_20_N.svg`,
  `${nx}/public/icons/S2_Icon_AlertDiamondOrange_20_N.svg`,
];

class NxLocTranslate extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    title: { attribute: false },
    options: { attribute: false },
    langs: { attribute: false },
    urls: { attribute: false },
    _translateLangs: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  handleAction({ detail }) {
    if (detail === 'prev') {
      const opts = { bubbles: true, composed: true };
      const event = new CustomEvent('prev', opts);
      this.dispatchEvent(event);
    }
    // const detail = { org: this.org, site: this.site, view, urls };
    // const opts = { detail, bubbles: true, composed: true };
    // const event = new CustomEvent('next', opts);
    // this.dispatchEvent(event);
  }

  render() {
    return html`
      <nx-loc-actions
        @action=${this.handleAction}
        .message=${this._message}
        prev="Sync sources"
        ?nextDisabled=${!this._allSynced}
        next="Rollout">
      </nx-loc-actions>
      <div class="nx-loc-list-actions">
        <p class="nx-loc-list-actions-header">Translate (${this.options.service.name})</p>
        <div class="actions">
          <p><strong>Conflict behavior:</strong> ${this.options['sync.conflict.behavior']}</p>
          <sl-button @click=${this.handleSyncAll} class="accent">Connect</sl-button>
        </div>
      </div>
      <div class="nx-loc-list-header">
        <p>Language</p>
        <p class="lang-count">Sent</p>
        <p class="lang-count">Translated</p>
        <p class="lang-count">Saved</p>
        <p class="status-label">Status</p>
      </div>
      <ul>
        ${this.langs.map((lang) => html`
          <li>
            <div class="inner">
              <p>${lang.name}</p>
              <p class="lang-count">${lang.sent || 0}</p>
              <p class="lang-count">${lang.translate || 0}</p>
              <p class="lang-count">${lang.saved || 0}</p>
              <div class="url-status">
              </div>
            </div>
          </li>
        `)}
      </ul>
    `;
  }
}

customElements.define('nx-loc-translate', NxLocTranslate);

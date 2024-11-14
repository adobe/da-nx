/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { LitElement, html, nothing } from 'https://da.live/nx/public/deps/lit/dist/index.js';
import { mergeCopy, overwriteCopy } from 'https://da.live/nx/blocks/loc/project/index.js';
import getStyle from 'https://da.live/nx/public/utils/styles.js';
import getSvg from 'https://da.live/nx/public/utils/svg.js';
import getPrefixDetails from './index.js';

const ICONS = [
  'https://da.live/nx/public/icons/Smock_Close_18_N.svg',
  'https://da.live/nx/public/icons/Smock_Add_18_N.svg',
  'https://da.live/nx/public/icons/Smock_LinkOut_18_N.svg',
];

const style = await getStyle(import.meta.url);
const buttons = await getStyle('https://da.live/nx/styles/buttons.js');

export default class DaRollout extends LitElement {
  static properties = { _prefixes: { state: true } };

  connectedCallback() {
    super.connectedCallback();
    this.getRolloutInfo();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  async getRolloutInfo() {
    const { org, repo, path, token } = this;
    const { currPrefix, prefixes } = await getPrefixDetails(org, repo, token, path);
    if (!(currPrefix && prefixes)) return;
    this._currPrefix = currPrefix;
    this._prefixes = prefixes;
  }

  async handleRollout(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const { behavior, label } = Object.fromEntries(formData);
    const copyLabel = label === '' ? 'Adhoc' : label;
    this._active.map(async (prefix) => {
      prefix.status = 'none';
      const copyFn = behavior === 'overwrite' ? overwriteCopy : mergeCopy;
      await copyFn(prefix, copyLabel);
      this.requestUpdate();
    });
  }

  // eslint-disable-next-line class-methods-use-this
  open(prefix) {
    window.open(`https://da.live/edit#${prefix.edit}`, `_${prefix.edit}`);
  }

  toggle(prefix) {
    prefix.active = !prefix.active;
    this.requestUpdate();
  }

  get _active() {
    return this._prefixes.filter((prefix) => prefix.active);
  }

  get _inactive() {
    return this._prefixes.filter((prefix) => !prefix.active);
  }

  get _disabled() {
    return !this._prefixes || this._prefixes.length === this._inactive.length;
  }

  renderList(title, items) {
    return html`
      <div class="da-form-row">
        ${items.length === 0 ? nothing : html` 
          <label>${title}</label>
          <ul class="prefix-list">
            ${items.map((prefix) => html`
              <li class="da-prefix ${prefix.active ? 'is-active' : ''} status-${prefix.status || 'none'}">
                <span>${prefix.path.replace('/', '')}</span>
                <div class="prefix-actions">
                  <button type="button" @click=${() => this.open(prefix)}>
                    <svg class="icon"><use href="#spectrum-linkOut"/></svg>
                  </button>
                  <button type="button" @click=${() => this.toggle(prefix)} class="toggle">
                    ${prefix.active ? html`<svg class="icon"><use href="#spectrum-close"/></svg>` : html`<svg class="icon"><use href="#spectrum-add"/></svg>`}
                  </button>
                </div>
              </li>
          </ul>`)}
      </div>`}
    `;
  }

  render() {
    return html`
      <form @submit=${this.handleRollout}>
        <div class="da-form-row">
          <div class="two-col">
            <div>
              <label>Behavior</label>
              <div class="select-wrapper">
                <select name="behavior">
                  <option value="merge">Merge</option>
                  <option value="overwrite">Overwrite</option>
                </select>
              </div>
            </div>
            <div>
              <label>Label <span>(optional)</span></label>
              <input type="text" name="label" placeholder="adhoc" />
            </div>
          </div>
        </div>
        ${this._prefixes ? html`
          <div class="two-col">
            ${this.renderList('Include', this._active)}
            ${this.renderList('Exclude', this._inactive)}
            ` : nothing}
          </div>
        <div class="da-form-row da-form-actions">
          <button class="accent" ?disabled=${this._disabled}>Rollout</button>
        </div>
      </form>`;
  }
}

customElements.define('da-rollout', DaRollout);

(async function init() {
  const { context, token } = await DA_SDK;

  const daRollout = document.createElement('da-rollout');
  daRollout.path = context.path;
  daRollout.token = token;
  daRollout.repo = context.repo;
  daRollout.org = context.org;
  document.body.append(daRollout);
}());

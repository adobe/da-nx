import DA_SDK from '../../../utils/sdk.js';
import { LitElement, html, nothing } from '../../deps/lit/dist/index.js';
import getStyle from '../../utils/styles.js';
import getSvg from '../../utils/svg.js';
import { createCopy } from '../../loc/copy.js';
import { createRolloutResolver } from '../../../blocks/loc/utils/placeholders.js';
import { DA_ORIGIN } from '../../utils/constants.js';
import getPrefixDetails from './index.js';

const ICONS = [
  'https://da.live/nx/public/icons/Smock_Close_18_N.svg',
  'https://da.live/nx/public/icons/Smock_Add_18_N.svg',
  'https://da.live/nx/public/icons/Smock_LinkOut_18_N.svg',
];

const style = await getStyle(import.meta.url);
const buttons = await getStyle('https://da.live/nx/styles/buttons.js');

export default class DaRollout extends LitElement {
  static properties = {
    _currPrefix: { state: true },
    _prefixes: { state: true },
    _isLocale: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.getRolloutInfo();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  async getRolloutInfo() {
    const { org, repo, path, token } = this;
    const { currPrefix, prefixes, isLocale } = await getPrefixDetails(org, repo, token, path);
    this._currPrefix = currPrefix;
    this._prefixes = prefixes;
    this._isLocale = isLocale;
  }

  async handleRollout(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const { behavior, label } = Object.fromEntries(formData);
    const copyLabel = label === '' ? 'Adhoc' : label;
    const { org, repo, token } = this;
    const resolver = this._currPrefix !== '/' && createRolloutResolver({
      load: (path) => fetch(`${DA_ORIGIN}/source${path}`, { headers: { Authorization: `Bearer ${token}` } }),
      sitePath: `/${org}/${repo}`,
    });
    this._active.map(async (prefix) => {
      prefix.status = 'none';
      prefix.root = prefix.path;
      const { error } = resolver ? await resolver.prepareSource(prefix) : {};
      prefix.error = error;
      if (error) {
        prefix.status = 'error';
      } else {
        const copyFn = behavior === 'overwrite' ? this.copy.overwriteCopy : this.copy.mergeCopy;
        await copyFn(prefix, copyLabel);
      }
      this.requestUpdate();
    });
  }

  open(prefix) {
    window.open(`https://da.live/edit#${prefix.edit}`, `_${prefix.edit}`);
  }

  async toggle(prefix) {
    prefix.active = !prefix.active;
    this.requestUpdate();
    await this.updateComplete;
    // The prefix moves between lists, so keep focus on its toggle in the new location
    const toggles = [...this.shadowRoot.querySelectorAll('button.toggle')];
    toggles.find((btn) => btn.dataset.path === prefix.path)?.focus();
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

  renderPrefix(prefix) {
    const name = prefix.path.replace('/', '');
    return html`
      <li class="da-prefix ${prefix.active ? 'is-active' : ''} status-${prefix.status || 'none'}" title=${prefix.error || nothing}>
        <span>${name}</span>
        <div class="prefix-actions">
          <button type="button" aria-label="Open ${name} in a new tab" @click=${() => this.open(prefix)}>
            <svg class="icon" aria-hidden="true"><use href="#spectrum-linkOut"/></svg>
          </button>
          <button
            type="button"
            class="toggle"
            data-path=${prefix.path}
            aria-label="Include ${name}"
            aria-pressed=${prefix.active ? 'true' : 'false'}
            @click=${() => this.toggle(prefix)}>
            ${prefix.active ? html`<svg class="icon" aria-hidden="true"><use href="#spectrum-close"/></svg>` : html`<svg class="icon" aria-hidden="true"><use href="#spectrum-add"/></svg>`}
          </button>
        </div>
      </li>`;
  }

  renderList(title, items) {
    const labelId = `${title.toLowerCase()}-label`;
    return html`
      <div class="da-form-row">
        ${items.length === 0 ? nothing : html`
          <label id=${labelId}>${title}</label>
          <ul class="prefix-list" aria-labelledby=${labelId}>
            ${items.map((prefix) => this.renderPrefix(prefix))}
          </ul>`}
      </div>`;
  }

  renderForm() {
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
          </div>` : nothing}
        ${this._prefixes?.filter((prefix) => prefix.error).map((prefix) => html`<p class="prefix-error">${prefix.error}</p>`)}
        <div class="da-form-row da-form-actions">
          <button class="accent" ?disabled=${this._disabled}>Rollout</button>
        </div>
      </form>`;
  }

  renderLocale() {
    return html`
      <div class="locale-note">
        <p class="locale-note-title">Locale</p>
        <p class="locale-note-text">This page is in a locale (${this._currPrefix}). There are no downstream pages to rollout to.</p>
      </div>
    `;
  }

  render() {
    return this._isLocale ? this.renderLocale() : this.renderForm();
  }
}

customElements.define('da-rollout', DaRollout);

(async function init() {
  const { context, token, actions } = await DA_SDK;

  const daRollout = document.createElement('da-rollout');
  daRollout.copy = createCopy({
    fetch: actions.daFetch,
    daOrigin: DA_ORIGIN,
  });
  daRollout.path = context.path;
  daRollout.token = token;
  daRollout.repo = context.repo;
  daRollout.org = context.org;
  document.body.append(daRollout);
}());

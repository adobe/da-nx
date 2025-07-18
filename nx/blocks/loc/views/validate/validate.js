import { LitElement, html, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { Queue } from '../../../../public/utils/tree.js';
import { convertPath, fetchConfig } from '../../utils/utils.js';
import { getFragmentUrls } from './validate-utils.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const DA_LIVE = 'https://da.live';

class NxLocValidate extends LitElement {
  static properties = {
    project: { attribute: false },
    message: { attribute: false },
    _org: { state: true },
    _site: { state: true },
    _urls: { state: true },
    _configSheet: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    this.setupProject();
  }

  update(props) {
    // Allow the parent to pass or clear a message
    if (props.has('message')) this._message = this.message;
    super.update();
  }

  setupProject() {
    const { org, site, urls } = this.project;

    this._org = org;
    this._site = site;
    this._urls = urls.map((url) => new URL(url.suppliedPath, this.origin));

    this.checkUrls();
  }

  async findConfigValue(key) {
    if (!this._configSheet) this._configSheet = await fetchConfig(this._org, this._site);

    const foundRow = this._configSheet.config.data.find((row) => row.key === key);

    return foundRow?.value;
  }

  async getOriginMatches() {
    const value = await this.findConfigValue('source.fragment.hostnames');

    return value?.split(',').map((role) => `https://${role.trim()}`) || [];
  }

  checkDomain(href) {
    return [...this._originMatches, this.subOrigin].some((origin) => href?.startsWith(origin));
  }

  async findFragments(text) {
    const fragmentUrls = getFragmentUrls(text);

    const fragments = fragmentUrls.reduce((acc, href) => {
      const include = this.checkDomain(href);

      // Don't add any off-origin fragments
      if (!include) return acc;

      // Convert href to current project origin
      let url;
      try {
        url = new URL(href, this.origin);
      } catch (e) {
        return acc;
      }

      // Combine what already exists with what we're currently iterating through
      const currentUrls = [...this._urls, ...acc];

      // Check if its already in our URL list
      const found = currentUrls.some((existingUrl) => existingUrl.pathname === url.pathname);
      if (!found) acc.push(url);

      return acc;
    }, []);

    this._urls.push(...fragments);
  }

  async checkUrl(url) {
    let { pathname } = url;
    pathname = pathname.endsWith('/') ? `${pathname}index` : pathname;
    const isSheet = pathname.endsWith('.json');
    const extPath = isSheet ? pathname : `${pathname}.html`;
    const daUrl = `${DA_ORIGIN}/source/${this._org}/${this._site}${extPath}`;
    const resp = await daFetch(daUrl);
    const text = await resp.text();
    const ok = resp.status === 200;
    url.status = ok ? 'ready' : 'error - not found';
    url.checked = ok;
    url.sheet = isSheet;
    url.extPath = extPath;
    url.fragment = url.pathname.includes('/fragments/');
    url.daEdit = `${DA_LIVE}/edit#/${this._org}/${this._site}${url.pathname}`;
    if (ok) await this.findFragments(text);
    this.requestUpdate();
  }

  async checkUrls() {
    // See if there are any additional
    // origins to match fragments against
    this._originMatches = await this.getOriginMatches();

    const checkUrl = this.checkUrl.bind(this);

    const queue = new Queue(checkUrl, 50);

    let notChecked;
    while (!notChecked || notChecked.length > 0) {
      notChecked = this._urls.filter((url) => !url.status);

      await Promise.all(notChecked.map((url) => queue.push(url)));

      notChecked = this._urls.filter((url) => !url.status);
    }
  }

  async getSourcePrefix() {
    const sourceLang = await this.findConfigValue('source.language');
    if (!sourceLang) return undefined;
    const foundLang = this._configSheet.languages.data.find((row) => row.name === sourceLang);
    if (!foundLang) return undefined;
    return foundLang.location;
  }

  async getUpdates() {
    const checked = this._urls.filter((url) => url.checked);
    if (checked.some((url) => (url.status === 'error'))) {
      return { message: { type: 'error', text: 'Uncheck error URLs below.' } };
    }
    if (checked.length < 1) {
      return { message: { type: 'error', text: 'Please select at least one URL.' } };
    }

    const sourcePrefix = await this.getSourcePrefix();
    const urls = checked.map((url) => {
      const { aemBasePath } = convertPath({ path: url.pathname, sourcePrefix });
      return {
        basePath: aemBasePath,
        suppliedPath: url.pathname,
        checked: url.checked,
      };
    });

    return { updates: { urls } };
  }

  async handleAction(e) {
    const { view } = e.detail;
    const { message, updates } = await this.getUpdates();
    if (message) {
      this._message = message;
      return;
    }
    const data = { view, ...updates };
    const opts = { detail: { data }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  handleChanged(url) {
    url.checked = !url.checked;
    this._urls = [...this._urls];
  }

  get notReady() {
    const checked = this._urls?.filter((url) => url.checked);
    if (!checked.length) return true;
    return checked.some((url) => url.status !== 'ready');
  }

  get origin() {
    return `https://main--${this.project.site}--${this.project.org}.aem.page`;
  }

  get subOrigin() {
    return `https://main--${this.project.site}--${this.project.org}`;
  }

  render() {
    if (!this._urls) return nothing;

    return html`
      <nx-loc-actions
        .project=${this.project}
        .message=${this._message}
        @action=${this.handleAction}>
      </nx-loc-actions>
      ${this._urls ? html`
        <div class="details">
          <div class="detail-card detail-card-pages">
            <p>Docs</p>
            <p>${this._urls.filter((url) => !url.fragment).length}</p>
          </div>
          <div class="detail-card detail-card-fragments">
            <p>Fragments</p>
            <p>${this._urls.filter((url) => url.fragment).length}</p>
          </div>
          <div class="detail-card detail-card-sheets">
            <p>Sheets</p>
            <p>${this._urls.filter((url) => url.sheet).length}</p>
          </div>
          <div class="detail-card detail-card-errors">
            <p>Errors</p>
            <p>${this._urls.filter((url) => url.status === 'error').length}</p>
          </div>
          <div class="detail-card detail-card-size">
            <p>Selected</p>
            <p>${this._urls.filter((url) => url.checked).length}</p>
          </div>
        </div>
      ` : nothing}
      <ul>
        ${this._urls ? this._urls.map((url) => html`
          <li>
            <div class="checkbox-wrapper">
              <input type="checkbox" .checked=${url.checked} @change=${() => this.handleChanged(url)} />
            </div>
            <a href=${url.daEdit} class="path" target="_blank">${url.pathname}</a>
            <div class="status status-${url.status}">${url.status}</div>
          </li>
        `) : nothing}
      </ul>
    `;
  }
}

customElements.define('nx-loc-validate', NxLocValidate);

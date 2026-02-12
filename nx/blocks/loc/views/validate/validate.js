import { LitElement, html, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { Queue } from '../../../../public/utils/tree.js';
import { convertPath, createSnapshotPrefix, fetchConfig, getSuppliedPrefix } from '../../utils/utils.js';
import { getOriginMatches, getFragmentUrls } from './utils.js';
import DaUrl from '../../utils/daUrl.js';

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
    _snapshot: { state: true },
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

  async setupProject() {
    const { org, site, snapshot, urls } = this.project;

    this._org = org;
    this._site = site;
    this._snapshot = snapshot;
    this._urls = urls.map((url) => new DaUrl(url.href));

    // If there's an org and site, get the config for the project
    if (org && site) this._configSheet = await fetchConfig(this._org, this._site);

    this.checkUrls();
  }

  checkDomain(href) {
    return [...this._originMatches].some((origin) => href?.startsWith(origin));
  }

  async findFragments(text) {
    const fragmentUrls = getFragmentUrls(text);

    const fragments = fragmentUrls.reduce((acc, href) => {
      const include = this.checkDomain(href);

      // Don't add any off-origin fragments
      if (!include) return acc;

      // Convert href to current project origin
      let daUrl;
      try {
        const parsed = new URL(href);
        const url = new URL(parsed.pathname, this.origin);
        daUrl = new DaUrl(url.href);
      } catch (e) {
        return acc;
      }

      console.log(daUrl);

      // Combine what already exists with what we're currently iterating through
      const currentUrls = [...this._urls, ...acc];

      // Check if its already in our URL list
      const found = currentUrls.some(
        (existingUrl) => existingUrl.supplied.aemPath === daUrl.supplied.aemPath,
      );
      if (!found) acc.push(daUrl);

      return acc;
    }, []);

    this._urls.push(...fragments);
  }

  async checkUrl(url) {
    const { org, site, daAdminPath } = url.supplied;
    const { edit } = url.views;
    const resp = await daFetch(`${DA_ORIGIN}/source/${org}/${site}${daAdminPath}`);
    const text = await resp.text();
    const ok = resp.status === 200;
    url.status = ok ? 'ready' : 'error - not found';
    url.checked = ok;
    url.isSheet = daAdminPath.endsWith('.json');
    url.isFragment = daAdminPath.includes('/fragments/');
    url.daEdit = edit;
    if (ok) await this.findFragments(text);
    this.requestUpdate();
  }

  async checkUrls() {
    // See if there are any additional
    // origins to match fragments against
    this._originMatches = await getOriginMatches(this._configSheet);

    const checkUrl = this.checkUrl.bind(this);

    const queue = new Queue(checkUrl, 50);

    let notChecked;
    while (!notChecked || notChecked.length > 0) {
      notChecked = this._urls.filter((url) => !url.status);

      await Promise.all(notChecked.map((url) => queue.push(url)));

      notChecked = this._urls.filter((url) => !url.status);
    }
  }

  async getUpdates() {
    const checked = this._urls.filter((url) => url.checked);
    if (checked.some((url) => (url.status === 'error'))) {
      return { message: { type: 'error', text: 'Uncheck error URLs below.' } };
    }
    if (checked.length < 1) {
      return { message: { type: 'error', text: 'Please select at least one URL.' } };
    }

    // Sanitize DaUrls to something we can persist
    const urls = checked.map((daUrl) => ({ href: daUrl.href, checked: daUrl.checked }));

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

  get originPrefix() {
    return `https://${this.project.snapshot ? `${this.project.snapshot}--` : ''}main`;
  }

  get origin() {
    return `https://main--${this._site}--${this._org}.aem.page`;
  }

  get subOrigin() {
    return `${this.originPrefix}--${this.project.site}--${this.project.org}`;
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
            <p>${this._urls.filter((url) => !url.isFragment && !url.isSheet).length}</p>
          </div>
          <div class="detail-card detail-card-fragments">
            <p>Fragments</p>
            <p>${this._urls.filter((url) => url.isFragment).length}</p>
          </div>
          <div class="detail-card detail-card-sheets">
            <p>Sheets</p>
            <p>${this._urls.filter((url) => url.isSheet).length}</p>
          </div>
          <div class="detail-card detail-card-errors">
            <p>Errors</p>
            <p>${this._urls.filter((url) => url.status?.includes('error')).length}</p>
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
            <a href=${url.views.edit} class="path" target="_blank">${url.supplied.aemPath}</a>
            <div class="status status-${url.status}">${url.status}</div>
          </li>
        `) : nothing}
      </ul>
    `;
  }
}

customElements.define('nx-loc-validate', NxLocValidate);

import { LitElement, html, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { Queue } from '../../../../public/utils/tree.js';
import { fetchOptions } from '../../utils/utils.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);
const parser = new DOMParser();

const DA_LIVE = 'https://da.live';
const FRAGMENT_SELECTOR = 'a[href*="/fragments/"], .fragment a';

class NxLocValidate extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    options: { attribute: false },
    urls: { attribute: false },
    _options: { state: true },
    _urls: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  update(props) {
    if (props.has('urls') && this.urls) {
      this._urls = this.urls.map((url) => new URL(url.suppliedPath, this.origin));
      this.checkUrls();
    }
    super.update();
  }

  async getOriginMatches() {
    const { config } = await fetchOptions(this.org, this.site);

    const hostnameRow = config.data.find((row) => row.key === 'source.fragment.hostnames');

    return hostnameRow?.value.split(',').map((role) => `https://${role.trim()}`) || [];
  }

  checkDomain(href) {
    return [...this._originMatches, this.subOrigin].some((origin) => href.startsWith(origin));
  }

  async findFragments(text) {
    const dom = parser.parseFromString(text, 'text/html');
    const results = dom.body.querySelectorAll(FRAGMENT_SELECTOR);
    const fragments = [...results].reduce((acc, a) => {
      const href = a.getAttribute('href');

      const include = this.checkDomain(href);

      // Don't add any off-origin fragments
      if (!include) return acc;

      // Convert href to current project origin
      const url = new URL(href, this.origin);

      // Check if its already in our URL list
      const found = this._urls.some((existingUrl) => existingUrl.pathname === url.pathname);
      if (found) return acc;

      acc.push(url);
      return acc;
    }, []);

    this._urls.push(...fragments);
  }

  async checkUrl(url) {
    let { pathname } = url;
    pathname = pathname.endsWith('/') ? `${pathname}index` : pathname;
    const isSheet = pathname.endsWith('.json');
    const extPath = isSheet ? pathname : `${pathname}.html`;
    const daUrl = `${DA_ORIGIN}/source/${this.org}/${this.site}${extPath}`;
    const resp = await daFetch(daUrl);
    const text = await resp.text();
    const ok = resp.status === 200;
    url.status = ok ? 'ready' : 'error';
    url.checked = ok;
    url.sheet = isSheet;
    url.extPath = extPath;
    url.fragment = url.pathname.includes('/fragments/');
    url.daEdit = `${DA_LIVE}/edit#/${this.org}/${this.site}${url.pathname}`;
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

  handleSubmit() {
    const checked = this._urls.filter((url) => url.checked);
    if (checked.some((url) => (url.status === 'error'))) {
      this._message = { type: 'error', text: 'Uncheck error URLs below.' };
      return;
    }
    if (checked.length < 1) {
      this._message = { type: 'error', text: 'No URLs selected.' };
      return;
    }

    const urls = checked.map((url) => ({
      suppliedPath: url.pathname,
      checked: url.checked,
    }));

    const detail = { view: 'options', org: this.org, site: this.site, urls };

    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('next', opts);
    this.dispatchEvent(event);
  }

  handleChanged(url) {
    url.checked = !url.checked;
    this._urls = [...this._urls];
  }

  handleAction({ detail }) {
    if (detail === 'prev') {
      const opts = { bubbles: true, composed: true };
      const event = new CustomEvent('prev', opts);
      this.dispatchEvent(event);
    }
    if (detail === 'next') this.handleSubmit();
  }

  get checked() {
    return this._urls?.some((url) => url.status);
  }

  get origin() {
    return `https://main--${this.site}--${this.org}.aem.page`;
  }

  get subOrigin() {
    return `https://main--${this.site}--${this.org}`;
  }

  render() {
    if (!this._urls) return nothing;

    return html`
      <nx-loc-actions @action=${this.handleAction} .message=${this._message} prev="Setup basics" next="Select options"></nx-loc-actions>
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

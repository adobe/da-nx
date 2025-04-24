import { LitElement, html, nothing } from '../../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import makeBatches from '../../../../utils/batch.js';
import { daFetch } from '../../../../utils/daFetch.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);
const parser = new DOMParser();

const DA_ADMIN = 'https://admin.da.live';
const DA_LIVE = 'https://da.live';
const FRAGMENT_SELECTOR = 'a[href*="/fragments/"], .fragment a';

class NxLocCheck extends LitElement {
  static properties = {
    title: { attribute: false },
    org: { attribute: false },
    repo: { attribute: false },
    urls: { attribute: false },
    checked: { attribute: false },
    _error: { state: true },
  };

  get origin() {
    return `https://main--${this.repo}--${this.org}.hlx.page`;
  }

  get projectSubDomain() {
    return `https://main--${this.repo}--${this.org}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  async findFragments(text) {
    const dom = parser.parseFromString(text, 'text/html');
    const results = dom.body.querySelectorAll(FRAGMENT_SELECTOR);
    const fragments = [...results].reduce((acc, a) => {
      const attr = a.getAttribute('href');

      // Don't add any off-origin fragments
      if (!attr.startsWith(this.projectSubDomain)) return acc;

      // Convert relative to current project origin
      const url = new URL(attr, this.origin);

      // Check if its already in our URL list
      const found = this.urls.some((existingUrl) => existingUrl.pathname === url.pathname);
      if (found) return acc;

      acc.push(url);
      return acc;
    }, []);

    this.urls.push(...fragments);
  }

  async checkUrl(url) {
    let { pathname } = url;
    pathname = pathname.endsWith('/') ? `${pathname}index` : pathname;
    const isSheet = pathname.endsWith('.json');
    const extPath = isSheet ? pathname : `${pathname}.html`;
    const daUrl = `${DA_ADMIN}/source/${this.org}/${this.repo}${extPath}`;
    const resp = await daFetch(daUrl);
    const text = await resp.text();
    const ok = resp.status === 200;
    url.status = ok ? 'ready' : 'error';
    url.checked = ok;
    url.sheet = isSheet;
    url.extPath = extPath;
    url.fragment = url.pathname.includes('/fragments/');
    url.daEdit = `${DA_LIVE}/edit#/${this.org}/${this.repo}${url.pathname}`;
    if (ok) await this.findFragments(text);
    return url;
  }

  async checkUrls() {
    if (this.checked) return;
    this.checked = true;

    let notChecked;
    while (!notChecked || notChecked.length > 0) {
      const batches = makeBatches(this.urls);

      for (const batch of batches) {
        await Promise.all(batch.map((url) => (!url.status ? this.checkUrl(url) : url)));
        this.urls = [...this.urls];
      }
      notChecked = this.urls.filter((url) => !url.status);
    }
  }

  handleSubmit(e) {
    e.preventDefault();
    const step = 'check';
    const urls = this.urls.filter((url) => url.checked);
    if (urls.some((url) => (url.status === 'error'))) {
      this._error = 'Uncheck error URLs below.';
      return;
    }
    if (urls.length < 1) {
      this._error = 'No URLs selected.';
      return;
    }

    const detail = { step, urls };
    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('next', opts);
    this.dispatchEvent(event);
  }

  handleChanged(url) {
    url.checked = !url.checked;
    this.urls = [...this.urls];
  }

  update(props) {
    if (props.has('urls')) this.checkUrls();
    super.update(props);
  }

  render() {
    return html`
      <form @submit=${this.handleSubmit}>
        <div class="sub-heading">
          <h2>Validate</h2>
          <div class="actions">
            ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
            <input type="submit" value="Next" class="accent" />
          </div>
        </div>
        <div>
          <label for="title">Title</label>
          <input type="text" name="title" value="${this.title}" disabled />
        </div>
        ${this.urls ? html`
          <div class="details">
            <div class="detail-card detail-card-pages">
              <p>Docs</p>
              <p>${this.urls.filter((url) => !url.fragment).length}</p>
            </div>
            <div class="detail-card detail-card-fragments">
              <p>Fragments</p>
              <p>${this.urls.filter((url) => url.fragment).length}</p>
            </div>
            <div class="detail-card detail-card-sheets">
              <p>Sheets</p>
              <p>${this.urls.filter((url) => url.sheet).length}</p>
            </div>
            <div class="detail-card detail-card-errors">
              <p>Errors</p>
              <p>${this.urls.filter((url) => url.status === 'error').length}</p>
            </div>
            <div class="detail-card detail-card-size">
              <p>Selected</p>
              <p>${this.urls.filter((url) => url.checked).length}</p>
            </div>
          </div>
        ` : nothing}
        <ul>
          ${this.urls ? this.urls.map((url) => html`
            <li>
              <div class="checkbox-wrapper">
                <input type="checkbox" .checked=${url.checked} @change=${() => this.handleChanged(url)} />
              </div>
              <a href=${url.daEdit} class="path" target="_blank">${url.pathname}</a>
              <div class="status status-${url.status}">${url.status}</div>
            </li>
          `) : nothing}
        </ul>
      </form>
    `;
  }
}

customElements.define('nx-loc-check', NxLocCheck);

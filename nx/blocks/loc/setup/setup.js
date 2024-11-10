import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';

import './steps/details.js';
import './steps/check.js';
import './steps/langs.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxLocSetup extends LitElement {
  static properties = {
    _title: { attribute: false },
    _urls: { attribute: false },
    _config: { attribute: false },
    _langs: { attribute: false },
    _org: { attribute: false },
    _repo: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  get checkCmp() {
    return this.shadowRoot.querySelector('nx-loc-check');
  }

  get langsCmp() {
    return this.shadowRoot.querySelector('nx-loc-langs');
  }

  handleCheck({ urls }) {
    this._urls = urls;

    this.langsCmp.org = this._org;
    this.langsCmp.repo = this._repo;
    this.langsCmp.urls = this._urls;
    this.langsCmp.title = this._title;
    this.langsCmp.config = this._config;
    this.langsCmp.langs = this._langs;
  }

  handleDetails({
    title,
    org,
    repo,
    urls,
    config,
    langs,
  }) {
    this._title = title;
    this._org = org;
    this._repo = repo;
    this._urls = urls;
    this._config = config;
    this._langs = langs;

    this.checkCmp.org = this._org;
    this.checkCmp.repo = this._repo;
    this.checkCmp.urls = this._urls;
    this.checkCmp.title = this._title;
  }

  handleNext(e) {
    if (e.detail.step === 'details') this.handleDetails(e.detail);
    if (e.detail.step === 'check') this.handleCheck(e.detail);
    if (e.detail.step === 'langs') this.handleLangs(e.detail);
    e.target.classList.toggle('hidden');
    e.target.nextElementSibling.classList.toggle('hidden');
  }

  render() {
    return html`
      <h1>Create new project</h1>
      <nx-loc-details @next=${this.handleNext}></nx-loc-details>
      <nx-loc-check @next=${this.handleNext} class="hidden"></nx-loc-check>
      <nx-loc-langs @next=${this.handleNext} class="hidden"></nx-loc-langs>
    `;
  }
}

customElements.define('nx-loc-setup', NxLocSetup);

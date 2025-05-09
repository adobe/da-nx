import { LitElement, html, nothing } from '../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';
import getSvg from '../../../utils/svg.js';

import './steps/details.js';
import './steps/check.js';
import './steps/langs.js';

const { nxBase: nx } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nx}/styles/buttons.js`);

const ICONS = [
  `${nx}/public/icons/S2_Icon_Archive_20_N.svg`,
  `${nx}/public/icons/S2_Icon_ListBulleted_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Binoculars_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Properties_20_N.svg`,
  `${nx}/public/icons/S2_Icon_GlobeGrid_20_N.svg`,
];

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
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  get pathViewState() {
    const { hash } = window.location;
    // if no hash, we should be on basics
    if (!hash) return { basics: 'highlight' };
    const path = hash.substring(1);
    const [, view, org, site, ...rest] = path.split('/');
    const viewState = { [view]: 'highlight' };
    if (org && site) viewState.projects = 'filled';
    return viewState;
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
    console.log(e.detail);

    // if (e.detail.step === 'details') this.handleDetails(e.detail);
    // if (e.detail.step === 'check') this.handleCheck(e.detail);
    // if (e.detail.step === 'langs') this.handleLangs(e.detail);
    // e.target.classList.toggle('hidden');
    // e.target.nextElementSibling.classList.toggle('hidden');
  }

  render() {
    return html`
      <div class="nx-setup-steps">
        <div class="nx-setup-steps-container">
          <button class="nx-loc-wizard-btn nx-loc-projects ${this.pathViewState.projects || ''}">
            <svg viewBox="0 0 20 20"><use href="#S2_Icon_Archive_20_N" /></svg>
            <p>All projects</p>
          </button>
          <hr class="${this.pathViewState.projects || nothing}"/>
          <div class="nx-setup-steps-middle">
            <button class="nx-loc-wizard-btn nx-loc-basics ${this.pathViewState.basics || nothing}">
              <svg viewBox="0 0 20 20"><use href="#S2_Icon_ListBulleted_20_N" /></svg>
              <p>Setup basics</p>
            </button>
            <hr/>
            <button class="nx-loc-wizard-btn nx-loc-basics">
              <svg viewBox="0 0 20 20"><use href="#S2_Icon_Binoculars_20_N" /></svg>
              <p>Validate references</p>
            </button>
            <hr/>
            <button class="nx-loc-wizard-btn nx-loc-basics">
              <svg viewBox="0 0 20 20"><use href="#S2_Icon_Properties_20_N" /></svg>
              <p>Configure options</p>
            </button>
          </div>
          <hr/>
          <button class="nx-loc-wizard-btn nx-loc-basics">
            <svg viewBox="0 0 20 20"><use href="#S2_Icon_GlobeGrid_20_N" /></svg>
            <p>Manage project</p>
          </button>
        </div>
      </div>
      <nx-loc-details @next=${this.handleNext}></nx-loc-details>
      <nx-loc-check @next=${this.handleNext} class="hidden"></nx-loc-check>
      <nx-loc-langs @next=${this.handleNext} class="hidden"></nx-loc-langs>
    `;
  }
}

customElements.define('nx-loc-setup', NxLocSetup);

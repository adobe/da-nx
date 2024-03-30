import { LitElement, html, nothing } from '../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';
import { getDetails, copy } from './index.js';
import makeGroup from '../../../utils/group.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxLocProject extends LitElement {
  static properties = {
    name: { attribute: false },
    langs: { attribute: false },
    urls: { attribute: false },
    status: { attribute: false },
  };

  constructor() {
    super();
    this.urls = [];
    this.langs = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    this.getProject();
  }

  async getProject() {
    const { name, langs, urls } = await getDetails();
    this.langs = langs;
    this.name = name;
    this.urls = urls;
  }

  async handleSync(destPrefix, idx) {
    console.log(idx);
    const groups = makeGroup([...this.urls], 80);
    for (const group of groups) {
      const groupLoaded = group.map(async (url) => {
        const { pathname, daSource } = url;
        const destination = `${destPrefix}${pathname}.html`;
        await copy({ source: daSource, destination });
        if (Number.isNaN(idx)) return;
        console.log('hi');
        this.langs[idx].complete += 1;
        this.langs = [...this.langs];
      });
      await Promise.all(groupLoaded);
    }
  }

  async handleRolloutAll() {
    performance.mark('start-rollout-all');
    for (const [idx, lang] of this.langs.entries()) {
      const localeLoaded = lang.locales.map(async (locale) => {
        const destPrefix = `/${locale}`;
        return this.handleSync(destPrefix, idx);
      });
      await Promise.all(localeLoaded);
    }
    performance.mark('end-rollout-all');
    performance.measure('rollout-all', 'start-rollout-all', 'end-rollout-all');
    const replaceTime = performance.getEntriesByName('rollout-all')[0].duration;
    console.log(String(replaceTime / 1000).substring(0, 4));
  }

  renderCards() {
    return html`
      <section class="nx-lang-cards">
        ${this.langs.map((lang) => html`
          <div class="nx-lang-card">
            <p class="detail">Language</p>
            <p class="nx-card-heading">${lang.language}</p>
            <p class="detail">Action</p>
            <p class="nx-card-heading">${lang.action}</p>
            <div class="nx-card-totals">
              <div class="totals-left">
                <p class="detail">Items</p>
                <p class="nx-card-heading">${this.urls.length}</p>
              </div>
              <div class="totals-right">
                <p class="detail">Complete</p>
                <p class="nx-card-heading">${lang.complete} of ${lang.locales.length * this.urls.length}</p>
              </div>
            </div>
            <div class="nx-lang-card-locales">
              ${lang.locales.map((locale) => html`<button class="action">${locale}</button>`)}
            </div>
            <div class="nx-lang-card-actions">
              <button class="primary">Rollout</button>
            </div>
          </div>
        `)}
      </section>
    `;
  }

  render() {
    return html`
      <button class="accent" @click="${() => this.handleSync('/langstore/en')}">Sync to langstore</button>
      <button class="accent" @click="${this.handleRolloutAll}">Rollout all</button>
      ${this.langs.length > 0 ? this.renderCards() : nothing}
    `;
  }
}

customElements.define('nx-loc-project', NxLocProject);

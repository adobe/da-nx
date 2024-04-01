import { LitElement, html, nothing } from '../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';
import { getDetails, copy } from './index.js';
import makeGroup from '../../../utils/group.js';

import '../card/card.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxLocProject extends LitElement {
  static properties = {
    _title: { attribute: false },
    _langs: { attribute: false },
    _urls: { attribute: false },
    _step: { attribute: false },
    _status: { attribute: false },
  };

  constructor() {
    super();
    this._urls = [];
    this._langs = [];
    this.cards = {};
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    this.getProject();
  }

  async getProject() {
    const {
      title, langs, urls, step,
    } = await getDetails();
    this._title = title;
    this._langs = langs;
    this._urls = urls;
    this._step = step;
  }

  updateCardState(lang, message) {
    if (lang && message) lang.status = message;
    this._langs = [...this._langs];
  }

  async checkErrors(locale) {
    const interval = setInterval(async () => {
      const noSuccess = locale.urls.filter((url) => url.status !== 'success');
      if (noSuccess.length === 0) clearInterval(interval);

      const errors = noSuccess.filter((url) => url.status === 'error');
      await Promise.all(errors.map(async (url) => copy(url)));

      this.updateCardState();
    }, 5000);
  }

  async rolloutLocale(locale) {
    // Reset URL status if already marked
    locale.urls.forEach((url) => delete url.status);

    // Batch requests
    const batchSize = Math.ceil(locale.urls.length / 50);
    const batches = makeGroup(locale.urls, batchSize);

    // Send it
    for (const batch of batches) {
      await Promise.all(batch.map(async (url) => {
        await copy(url);
        this._langs = [...this._langs];
      }));
    }

    // Cleanup any timeouts or errors
    const noSuccess = locale.urls.filter((url) => url.status !== 'success');
    if (noSuccess.length > 0) this.checkErrors(locale);
  }

  async rolloutLang(lang) {
    const localeKeys = Object.keys(lang.locales);

    await Promise.all(
      localeKeys.map((key) => this.rolloutLocale(lang.locales[key])),
    );
  }

  async rolloutLangstore(code) {
    this._status = 'Syncing to Langstore (en).';
    const lang = this._langs.find((langToFind) => langToFind.code === code);
    this.updateCardState(lang, 'syncing');
    await this.rolloutLocale(lang.langstore);
    this.updateCardState(lang, 'synced');
    this._status = null;
  }

  async rolloutAll() {
    performance.mark('start-rollout-all');
    for (const lang of this._langs) {
      this.updateCardState(lang, 'rolling-out');
      this._langs = [...this._langs];
      await this.rolloutLang(lang);
      this.updateCardState(lang, 'complete');
      this._langs = [...this._langs];
    }
    performance.mark('end-rollout-all');
    performance.measure('rollout-all', 'start-rollout-all', 'end-rollout-all');
    const replaceTime = performance.getEntriesByName('rollout-all')[0].duration;
    this._status = `Rollout took: ${String((replaceTime / 1000) / 60).substring(0, 4)} minutes`;
  }

  async handleStart() {
    this._step = 'sending';
    this._status = 'Starting project.';
    // Mock by copying from /langstore/en to all langstores
    const langs = this._langs.reduce((acc, lang) => {
      if (lang.code !== 'en') acc.push(lang);
      return acc;
    }, []);
    for (const lang of langs) {
      this.updateCardState(lang, 'syncing');
      await this.rolloutLocale(lang.langstore);
      lang.status = 'ready-for-rollout';
      this.updateCardState(lang, 'synced');
    }
    this._step = 'sent';
    this._status = null;
  }

  renderComplete(lang) {
    return Object.keys(lang.locales).reduce((acc, key) => {
      const { length } = lang.locales[key].urls.filter((url) => url.status === 'success');
      const complete = acc + length;
      return complete;
    }, 0);
  }

  renderCard(lang) {
    let card = this.cards[lang.code];
    if (!card) {
      card = document.createElement('nx-loc-card');
      card.addEventListener('on-rollout', (e) => this.rolloutLang(e.detail.lang));
      this.cards[lang.code] = card;
    }
    card.status = lang.status;
    card.lang = lang;
    card.total = this._urls.length;
    card.complete = this.renderComplete(lang);
    return card;
  }

  renderCards() {
    return html`
      <section class="nx-lang-cards">
        ${this._langs.map((lang) => this.renderCard(lang))}
      </section>
    `;
  }

  renderLangstore() {
    return html`<button class="accent" @click="${() => this.rolloutLangstore('en')}">Sync to langstore (en)</button>`;
  }

  renderStart() {
    return html`<button class="accent" @click="${() => this.handleStart()}">Start project</button>`;
  }

  renderRollout() {
    return html`<button class="accent" @click="${this.rolloutAll}">Rollout all</button>`;
  }

  render() {
    const canSyncSend = this._step && this._step !== 'sending' && this._step !== 'sent';
    const canRollout = this._step && this._step !== 'new' && this._step !== 'sending';

    return html`
      <section class="nx-action-status">
        <div class="nx-project-actions">
          ${canSyncSend ? this.renderLangstore() : nothing}
          ${canSyncSend ? this.renderStart() : nothing}
          ${canRollout ? this.renderRollout() : nothing}
        </div>
        ${this._status ? html`<p class="nx-status">${this._status}</p>` : nothing}
      </section>
      ${this._langs.length > 0 ? this.renderCards() : nothing}
    `;
  }
}

customElements.define('nx-loc-project', NxLocProject);

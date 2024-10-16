import { LitElement, html, nothing } from '../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';
import getSvg from '../../../utils/svg.js';
import { getDetails, rolloutCopy, overwriteCopy, translateCopy } from './index.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const ICONS = [
  `${nxBase}/blocks/locfour/img/arrow.svg`,
];

class NxLocProject extends LitElement {
  static properties = {
    _details: { state: true },
    _sourceLang: { state: true },
    _syncSourceUrls: { state: true },
    _status: { state: true },
    _langs: { state: true },
    _urls: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    this.setupProject();
  }

  async setupProject() {
    const {
      title, org, site, options, sourceLang, langs, urls,
    } = await getDetails();
    this._details = { title, org, site, options };
    this._sourceLang = sourceLang || { location: '/' };
    this._langs = langs;
    this._urls = urls;
    this.setupSourceLang();
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  setupSourceLang() {
    this._syncSourceUrls = this._urls.reduce((acc, url) => {
      const inSource = url.extpath.startsWith(this._sourceLang.location);
      if (!inSource) acc.push(url);
      return acc;
    }, []);
  }

  hasLocales() {
    return this._langs.some((lang) => lang.locales);
  }

  isTranslateProj() {
    return this._langs.some((lang) => lang.action === 'translate');
  }

  calculateRollout(lang) {
    let rolloutCount = 0;

    lang.locales.forEach((locale) => {
      if (locale.rolledOutUrls) {
        rolloutCount += locale.rolledOutUrls.length;
      }
    });

    return rolloutCount;
  }

  convertUrl({ path, srcLang, destLang }) {
    const srcPath = path.startsWith(srcLang) ? path : `${srcLang}${path}`;
    const destSlash = srcLang === '/' ? '/' : '';
    const destPath = path.startsWith(srcLang) ? path.replace(srcLang, `${destLang}${destSlash}`) : `${destLang}${path}`;

    return { source: srcPath, destination: destPath };
  }

  async handleSyncSource() {
    await Promise.all(this._urls.map(async (url) => {
      url.source = `/${this._details.org}/${this._details.site}${url.extpath}`;
      url.destination = `/${this._details.org}/${this._details.site}${this._sourceLang.location}${url.extpath}`;
      if (this._details.options.sourceConflict === 'overwrite') {
        await overwriteCopy(url, this._details.title);
      } else {
        await rolloutCopy(url, this._details.title);
      }
      this.requestUpdate();
      return url;
    }));
  }

  handleTranslate() {
    this._langs.forEach(async (lang) => {
      if (this._sourceLang.language === lang.name) {
        console.log('skipping source lang');
        return;
      }

      lang.translatedUrls = await Promise.all(this._urls.map(async (ogUrl) => {
        const url = { ...ogUrl };
        const { extpath } = url;

        const opts = { path: extpath, srcLang: this._sourceLang.location, destLang: lang.location };
        const { source, destination } = this.convertUrl(opts);

        url.source = `/${this._details.org}/${this._details.site}${source}`;
        url.destination = `/${this._details.org}/${this._details.site}${destination}`;

        await translateCopy(lang.code, url, this._details.title);
        return url;
      }));
      this.requestUpdate();
    });
  }

  async handleRolloutLang(lang) {
    lang.locales.map(async (locale) => {
      locale.rolledOutUrls = await Promise.all(this._urls.map(async (ogUrl) => {
        const url = { ...ogUrl };

        const opts = { path: url.extpath, srcLang: lang.location, destLang: locale.code };
        const { source, destination } = this.convertUrl(opts);

        url.source = `/${this._details.org}/${this._details.site}${source}`;
        url.destination = `/${this._details.org}/${this._details.site}${destination}`;

        if (this._details.options.rolloutConflict === 'overwrite') {
          await overwriteCopy(url, this._details.title);
        } else {
          await rolloutCopy(url, this._details.title);
        }

        return url;
      }));
      this.requestUpdate();
    });
  }

  handleRolloutAll() {
    this._langs.forEach(async (lang) => {
      if (!lang.locales) return;
      await this.handleRolloutLang(lang);
      this.requestUpdate();
    });
  }

  renderSyncSource() {
    return html`
      <div class="da-loc-box da-loc-sync-source">
        <div class="da-loc-box-title">
          <h3>Sync to ${this._sourceLang.language}</h3>
          <h3>Behavior: <span class="behavior-value">${this._details.options.sourceConflict}</span></h3>
        </div>
        <p>Project URLs do not originate from source language used for translation.</p>
        <ul>
          ${this._syncSourceUrls.map((url) => html`
            <li class="da-loc-sync-url">
              <div>${url.pathname}</div>
              <div>→</div>
              <div>${this._sourceLang.location}${url.pathname}</div>
              <div>${url.status}</div>
            </li>
          `)}
        </ul>
        <button class="primary" @click=${this.handleSyncSource}>Sync</button>
      </div>
    `;
  }

  renderTranslatLangs() {
    const langs = this._langs.filter((lang) => lang.action === 'translate');

    return html`
      ${langs.map((lang) => html`
        <div class="da-lang-card translate">
          <div class="da-card-top">
            <div>
              <p class="da-card-sub-title">Language</p>
              <p class="da-card-title">${lang.name}</p>
            </div>
            <div>
              <p class="da-card-sub-title">Translated</p>
              <p class="da-card-title">${lang.translatedUrls ? lang.translatedUrls.length : 0} of ${this._urls.length}</p>
            </div>
          </div>
        </div>
    `)}`;
  }

  renderTranslate() {
    return html`
      <div class="da-loc-box da-loc-send-for-translate">
        <div class="da-loc-box-title">
          <h3>Translate</h3>
          <h3>Behavior: <span class="behavior-value">${this._details.options.returnConflict}</span></h3>
        </div>
        <div class="da-lang-cards">
          ${this.renderTranslatLangs()}
        </div>
        <button class="primary" @click=${this.handleTranslate}>Send for translation</button>
      </div>
    `;
  }

  renderCards() {
    return html`
      <div class="da-loc-box da-loc-rollout">
        <div class="da-loc-box-title">
          <h3>Rollout</h3>
          <h3>Behavior: <span class="behavior-value">${this._details.options.rolloutConflict}</span></h3>
        </div>
        <div class="da-lang-cards">
          ${this._langs.map((lang) => (lang.locales ? html`
            <div class="da-lang-card rollout">
              <div class="da-card-top">
                <div>
                  <p class="da-card-sub-title">Language</p>
                  <p class="da-card-title">${lang.name}</p>
                </div>
              </div>
              <div class="da-card-bottom">
                <div class="da-loc-card-details">
                  <div>
                    <h4>Rolled out</h4>
                    <p>${this.calculateRollout(lang)} of ${this._urls.length * lang.locales.length}</p>
                  </div>
                  <div>
                    <h4>Previewed</h4>
                    <p>0 of ${this._urls.length * lang.locales.length}</p>
                  </div>
                  <div>
                    <h4>Published</h4>
                    <p>0 of ${this._urls.length * lang.locales.length}</p>
                  </div>
                </div>
                <div class="da-loc-card-locales">
                  ${lang.locales.map((locale) => html`<button class="action">${locale.code.replace('/', '')}</button>`)}
                </div>
                <button class="primary" @click=${() => { this.handleRolloutLang(lang); }}>Rollout</button>
              </div>
            </div>
          ` : nothing))}
        </div>
        <button class="primary" @click=${this.handleRolloutAll}>Rollout all</button>
      </div>
    `;
  }

  render() {
    if (!this._details) return null;

    return html`
      <p class="da-loc-detail-org">${this._details.org} / ${this._details.site}</p>
      <h2 class="da-loc-detail-title">${this._details.title}</h2>
      ${this._syncSourceUrls?.length > 0 ? this.renderSyncSource() : nothing}
      ${this.isTranslateProj() ? this.renderTranslate() : nothing}
      ${this.hasLocales() ? this.renderCards() : nothing}
    `;
  }
}

customElements.define('nx-loc-project', NxLocProject);

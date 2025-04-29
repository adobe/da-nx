import { LitElement, html, nothing } from '../../../deps/lit/dist/index.js';
import getStyle from '../../../utils/styles.js';
import { getDetails } from './index.js';

const style = await getStyle(import.meta.url);

class NxLocProject extends LitElement {
  static properties = {
    _state: { state: true },
    _org: { state: true },
    _repo: { state: true },
    _title: { state: true },
    _sitePath: { state: true },
    _service: { state: true },
    _sourceLang: { state: true },
    _needsSync: { state: true },
    _status: { state: true },
    _langs: { state: true },
    _urls: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.setupProject();
  }

  async setupProject() {
    this._state = await getDetails();
    const {
      title,
      org,
      site,
      config,
      options,
      sourceLang,
      langs,
      urls,
    } = this._state;

    this._org = org;
    this._repo = site;
    this._title = title;
    this._config = config;
    this._sitePath = `/${org}/${site}`;
    this._sourceLang = sourceLang || { location: '/' };
    this._langs = langs;
    this._urls = urls;

    const needsSync = urls.some((url) => !url.extPath.startsWith(this._sourceLang.location));
    const translateLangs = langs.filter((lang) => lang.action === 'translate');
    const rolloutLangs = langs.filter((lang) => lang.locales);

    if (needsSync) await this.setupSync(langs, options.sourceConflict);
    if (translateLangs.length > 0) await this.setupTranslate(translateLangs);
    if (rolloutLangs.length > 0) await this.setupRollout(rolloutLangs, options.rolloutConflict);
  }

  async setupSync(langs, behavior) {
    await import('./views/sync.js');
    const cmp = document.createElement('nx-loc-sync');
    cmp.state = this._state;
    cmp.title = this._title;
    cmp.sourceLang = this._sourceLang;
    cmp.sitePath = this._sitePath;
    cmp.langs = langs;
    cmp.urls = this._urls;
    cmp.conflictBehavior = behavior;
    this.shadowRoot.append(cmp);
  }

  async setupTranslate(langs) {
    await import('./views/translate.js');
    const cmp = document.createElement('nx-loc-translate');
    cmp.addEventListener('status', () => { this.updateSiblings(); });
    cmp.state = this._state;
    cmp.title = this._title;
    cmp.sourceLang = this._sourceLang;
    cmp.sitePath = this._sitePath;
    cmp.config = this._config;
    cmp.langs = langs;
    cmp.urls = this._urls;
    this.shadowRoot.append(cmp);
  }

  async setupRollout(langs, behavior) {
    await import('./views/rollout.js');
    const cmp = document.createElement('nx-loc-rollout');
    cmp.state = this._state;
    cmp.title = this._title;
    cmp.sitePath = this._sitePath;
    cmp.langs = langs;
    cmp.urls = this._urls;
    cmp.conflictBehavior = behavior;
    this.shadowRoot.append(cmp);
  }

  updateSiblings() {
    const cmps = this.shadowRoot.querySelectorAll('nx-loc-sync, nx-loc-rollout');
    cmps.forEach((cmp) => cmp.requestUpdate());
  }

  render() {
    if (!this._org) return nothing;

    return html`
      <p class="da-loc-detail-org">${this._org} / ${this._repo}</p>
      <h2 class="da-loc-detail-title">${this._title}</h2>
    `;
  }
}

customElements.define('nx-loc-project', NxLocProject);

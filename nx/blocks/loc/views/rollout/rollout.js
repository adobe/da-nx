import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getSvg from '../../../../utils/svg.js';
import { Queue } from '../../../../public/utils/tree.js';
import { calculateTime, timeoutWrapper, mergeCopy, overwriteCopy, formatDate } from '../../project/index.js';
import { getHasExt, getTranslateStepText, saveProject } from '../../utils/utils.js';

const { nxBase: nx } = getConfig();

const style = await getStyle(import.meta.url);

const ICONS = [
  `${nx}/public/icons/S2_Icon_CheckmarkCircleGreen_20_N.svg`,
  `${nx}/public/icons/S2_Icon_AlertDiamondOrange_20_N.svg`,
];

class NxLocRollout extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    path: { attribute: false },
    title: { attribute: false },
    options: { attribute: false },
    langs: { attribute: false },
    urls: { attribute: false },
    _urlErrors: { state: true },
    _readyLanguages: { state: true },
    _notReadyLanguages: { state: true },
    _completeLanguages: { state: true },
    _expandedLocales: { attribute: false },
    _expandedGroups: { attribute: false },
    _message: { state: true },
  };

  calculateReadyCount(lang) {
    function getSavedCount(action) {
      const { saved = 0 } = action ?? {};
      return saved;
    }
    return getSavedCount(lang.translation) + getSavedCount(lang.copy);
  }

  calculateStatus(lang) {
    const { action = '', rollout } = lang;

    if (rollout?.status) return rollout.status;
    if (!rollout && action !== 'rollout' && this.calculateReadyCount(lang) < this.urls.length) {
      return 'not ready';
    }

    return 'ready';
  }

  processLang(lang) {
    const status = this.calculateStatus(lang);
    if (status === 'not ready') {
      this._notReadyLanguages.push(lang);
    } else if (status === 'complete') {
      this._completeLanguages.push(lang);
    } else {
      this._readyLanguages.push(lang);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this._expandedLocales = {};
    this._expandedGroups = { ready: true, 'not ready': false, complete: false };
    this._readyLanguages = [];
    this._notReadyLanguages = [];
    this._completeLanguages = [];
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this.langs.forEach((lang) => this.processLang(lang));
  }

  handleAction({ detail }) {
    if (detail === 'prev') {
      const opts = { bubbles: true, composed: true };
      const event = new CustomEvent('prev', opts);
      this.dispatchEvent(event);
      return;
    }
    const nextDetail = { org: this.org, site: this.site, view: 'complete' };
    const opts = { detail: nextDetail, bubbles: true, composed: true };
    const event = new CustomEvent('next', opts);
    this.dispatchEvent(event);
  }

  async handleSaveProject() {
    const updates = {
      org: this.org,
      site: this.site,
      langs: this.langs,
    };
    await saveProject(this.path, updates);
  }

  async performRollout(lang) {
    // Don't roll out if already rolling out
    const rolloutStatus = lang?.rollout?.status;
    if (rolloutStatus === 'rolling out') return;
    const reRoll = rolloutStatus === 'complete';

    if (!lang.rollout) {
      lang.rollout = {};
    }
    const startTime = Date.now();
    lang.rollout.status = 'rolling out';
    lang.rolloutDate = undefined;
    lang.rolloutTime = undefined;
    lang.rolledOut = 0;
    lang.rolledOutByLocale = {};
    lang.locales.forEach((locale) => { lang.rolledOutByLocale[locale.code] = 0; });
    lang.errors = [];
    const items = lang.locales.reduce((acc, locale) => {
      const localeItems = this.urls.map((url) => {
        const hasExt = getHasExt(url.suppliedPath);
        const source = `/${this.org}/${this.site}${lang.location}${url.suppliedPath}${hasExt ? '' : '.html'}`;
        const destination = `/${this.org}/${this.site}${locale.code}${url.suppliedPath}${hasExt ? '' : '.html'}`;
        return async () => {
          const behavior = this.options['rollout.conflict.behavior'];
          const overwrite = behavior === 'overwrite' || hasExt;

          const copyFn = overwrite ? overwriteCopy : mergeCopy;
          const resp = await copyFn({ source, destination }, this.title);
          if (resp.ok || resp.error === 'timeout') {
            lang.rolledOut += 1;
            lang.rolledOutByLocale[locale.code] += 1;

            if (lang.rolledOut === items.length) {
              lang.rollout.status = 'complete';
              lang.rolloutDate = Date.now();
              lang.rolloutTime = calculateTime(startTime);
            }

            this.requestUpdate();
          } else {
            console.log('there was an error');
            lang.errors.push({ source, destination });
          }
        };
      });
      acc.push(...localeItems);
      return acc;
    }, []);

    const queue = new Queue(timeoutWrapper, 50);
    await Promise.all(items.map((item) => queue.push(item)));

    delete lang.rolledOutByLocale;

    if (!reRoll) {
      this._completeLanguages.push(lang);
      this._readyLanguages.splice(this._readyLanguages.indexOf(lang), 1);
    }
    await this.handleSaveProject();
  }

  async handleRollout(lang) {
    // if (lang?.rollout?.status === 'rolling out') return;
    this._message = { type: 'info', text: `Rolling out ${lang.code}.` };
    await this.performRollout(lang);
    this._message = undefined;
  }

  async handleRolloutAll() {
    const readyLanguages = this.langs.filter((lang) => this.calculateStatus(lang) === 'ready');
    if (readyLanguages.length === 0) return;
    this._message = { type: 'info', text: `Rolling out ${readyLanguages.map((lang) => lang.code).join(', ')}.` };
    for (const lang of readyLanguages) {
      await this.performRollout(lang);
    }
    this._message = undefined;
  }

  handleLangToggle(lang, e) {
    const locales = e.target.closest('ul').querySelectorAll(`li.locale.${lang}`);
    locales.forEach((locale) => { locale.classList.toggle('hide-locale'); });
    e.target.closest('li').classList.toggle('is-expanded');
    this.requestUpdate();
  }

  handleLocaleToggle(locale) {
    this._expandedLocales[locale.code] = !(this._expandedLocales[locale.code] ?? false);
    this.requestUpdate();
  }

  handleGroupToggle(state) {
    this._expandedGroups[state] = !(this._expandedGroups[state] ?? false);
    this.requestUpdate();
  }

  get rolloutComplete() {
    const langsWithLocales = this.langs.filter((lang) => lang.locales.length > 0);
    return langsWithLocales.every((lang) => lang.rollout?.status === 'complete');
  }

  renderRolloutAction() {
    return html`
        <p><strong>Conflict behavior:</strong> ${this.options['rollout.conflict.behavior']}</p>
        <sl-button @click=${this.handleRolloutAll} class="accent">Rollout All</sl-button>
      `;
  }

  renderUrlErrors() {
    if (!this._urlErrors) return nothing;

    return html`
      <div class="nx-loc-list-actions">
        <p class="nx-loc-list-actions-header">Errors</p>
      </div>
      <div class="nx-loc-list-header"><p>Message</p></div>
      <ul class="error-list">
        ${this._urlErrors.map((url) => html`
          <li>
            <div class="inner">
              <p>${url.error}</p>
            </div>
          </li>
        `)}
      </ul>
    `;
  }

  renderUrlDetails(locale) {
    if (!this._expandedLocales[locale.code]) return nothing;
    return this.urls.map((url) => {
      const path = `${locale.code}${url.suppliedPath.replace('.html', '')}`;
      return html`<div class="url-details">
        <p>${path}</p>
        <nx-loc-url-details .path="/${this.org}/${this.site}${path}"></nx-loc-url-details>
      </div>`;
    });
  }

  renderLocalesFor(lang, status) {
    const ready = (status !== 'not ready') ? this.urls.length : this.calculateReadyCount(lang);
    return lang.locales.map((locale) => {
      const urlCount = this.urls?.length ?? 0;
      const rolledOut = status === 'complete' ? urlCount : lang.rolledOutByLocale?.[locale.code] ?? 0;
      const localeStatus = status === 'rolling out' && rolledOut === urlCount ? 'complete' : status;
      return html`
        <li class="locale ${lang.code}${this._expandedLocales[locale.code] ? ' is-expanded' : ''}">
          <div class="inner">
            <p>${locale.code}</p>
            <p class="lang-count">${ready}</p>
            <p class="lang-count">${rolledOut}</p>
            <div class="lang-status is-${localeStatus.replaceAll(' ', '-')}">${localeStatus}</div>
            <button @click=${() => this.handleLocaleToggle(locale)} class="expand show-urls">Expand</button>
          </div>
          ${this.renderUrlDetails(locale)}
        </li>`;
    });
  }

  renderSummary() {
    return html`<div class="summary">
      <div class="summary-card">
        <p>Total languages</p>
        <p>${this.langs.length}</p>
      </div>
      <div class="summary-card summary-card-waiting">
        <p>Waiting</p>
        <p>${this._notReadyLanguages.length}</p>
      </div>
      <div class="summary-card summary-card-ready">
        <p>Rollout ready</p>
        <p>${this._readyLanguages.length}</p>
      </div>
      <div class="summary-card summary-card-complete">
        <p>Rollout complete</p>
        <p>${this._completeLanguages.length}</p>
      </div>
    </div>`;
  }

  renderGroupHeader(groupName, groupTitle) {
    return html`<div class="nx-loc-list-header${this._expandedGroups[groupName] ? ' is-expanded' : ''}">
      <p>${groupTitle}</p>
      <button @click=${() => this.handleGroupToggle(groupName)} class="expand show-group">Expand</button>
    </div>`;
  }

  renderGroupLanguages(languages, showRolloutDate) {
    return html`<ul>${languages.map((lang) => {
      const status = this.calculateStatus(lang);
      let date = '';
      let time = '';
      if (showRolloutDate && status === 'complete' && lang.rolloutDate) {
        ({ date, time } = formatDate(lang.rolloutDate));
      }
      return html`
        <li class="language-header is-expanded">
          <div class="inner">
            <p>${lang.name}${date && time ? html` <span class="rollout-date">(rolled out on ${date} at ${time})</span>` : ''}</p>
            <p class="lang-count">Ready</p>
            <p class="lang-count">Rolled Out</p>
            <div class="lang-status">
              <sl-button @click=${() => this.handleRollout(lang)} class="primary outline" ?disabled=${status === 'not ready'}>Rollout</sl-button>
            </div>
            <button @click=${(e) => this.handleLangToggle(lang.code, e)} class="expand">Expand</button>
          </div>
        </li>
        ${this.renderLocalesFor(lang, status)}`;
    })}</ul>`;
  }

  renderGroup(groupName, groupTitle, languages) {
    if (languages.length === 0) return nothing;
    return html`
      ${this.renderGroupHeader(groupName, groupTitle)}
      ${this._expandedGroups[groupName] ? this.renderGroupLanguages(languages, groupName === 'complete') : nothing}`;
  }

  renderLanguages() {
    return html`
      <div class="nx-loc-list-actions">
        <p class="nx-loc-list-actions-header">Rollout</p>
        <div class="actions">${this.renderRolloutAction()}</div>
      </div>
      ${this.renderSummary()}
      ${this.renderGroup('ready', 'Ready for Rollout', this._readyLanguages)}
      ${this.renderGroup('not ready', 'Waiting', this._notReadyLanguages)}
      ${this.renderGroup('complete', 'Complete', this._completeLanguages)}`;
  }

  render() {
    return html`
      <nx-loc-actions
        @action=${this.handleAction}
        .message=${this._message}
        prev=${getTranslateStepText(this.langs)}

        next="Project complete">
      </nx-loc-actions>
      ${this.renderUrlErrors()}
      ${this.renderLanguages()}
    `;
  }
}

customElements.define('nx-loc-rollout', NxLocRollout);

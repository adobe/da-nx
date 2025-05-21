import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getSvg from '../../../../utils/svg.js';
import { saveProject } from '../../utils/utils.js';

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
    groupedLangs: { attribute: false },
    _urlErrors: { state: true },
    _connected: { state: true },
    _translateLangs: { state: true },
    _copyLangs: { state: true },
    _message: { state: true },
  };

  processLang(lang) {
    function getSavedCount(action) {
      const { saved = 0 } = action ?? {};
      return saved;
    }

    const { action = '' } = lang;
    let ready = 0;
    let addTo = null;
    let status = '';
    if (action === 'rollout') {
      ready = this.urls.length;
      addTo = this.groupedLangs[0].langs;
      status = 'ready';
    } else if (lang?.rollout && lang.rollout.status === 'complete') {
      ready = this.urls.length;
      addTo = this.groupedLangs[2].langs;
      status = 'complete';
    } else {
      ready = getSavedCount(lang.translation) + getSavedCount(lang.copy);
      if (ready === this.urls.length) {
        addTo = this.groupedLangs[0].langs;
        status = 'ready';
      } else {
        addTo = this.groupedLangs[1].langs;
        status = 'not ready';
      }
    }
    if (addTo) {
      addTo.push({
        ...lang,
        ready,
        status,
        locales: lang.locales.map((locale) => ({
          ...locale,
          rolledOut: 0,
          expanded: false,
        })),
      });
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this.groupedLangs = [{
      title: 'Ready for Rollout',
      langs: [],
      expanded: true,
    }, {
      title: 'Waiting',
      langs: [],
      expanded: false,
    }, {
      title: 'Complete',
      langs: [],
      expanded: false,
    }];
    this.langs.forEach((lang) => this.processLang(lang));
  }

  handleAction({ detail }) {
    if (detail === 'prev') {
      const opts = { bubbles: true, composed: true };
      const event = new CustomEvent('prev', opts);
      this.dispatchEvent(event);
    }
    // const detail = { org: this.org, site: this.site, view, urls };
    // const opts = { detail, bubbles: true, composed: true };
    // const event = new CustomEvent('next', opts);
    // this.dispatchEvent(event);
  }

  async handleSendAll() {

  }

  handleToggleLangExpand(lang, e) {
    const locales = e.target.closest('ul').querySelectorAll(`li.locale.${lang}`);
    locales.forEach((locale) => { locale.classList.toggle('hide-locale'); });
    e.target.closest('li').classList.toggle('is-expanded');
  }

  handleToggleLocaleExpand(locale, e) {
    e.target.closest('li').classList.toggle('is-expanded');
    locale.expanded = !locale.expanded;
    this.requestUpdate();
  }

  handleGroupToggle(group) {
    group.expanded = !group.expanded;
    this.requestUpdate();
  }

  renderRolloutAction() {
    return html`
        <p><strong>Conflict behavior:</strong> ${this.options['rollout.conflict.behavior']}</p>
        <sl-button @click=${this.handleSendAll} class="accent">Rollout All</sl-button>
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
    if (!locale.expanded) return nothing;
    return this.urls.map((url) => {
      const path = `${locale.code}${url.suppliedPath.replace('.html', '')}`;
      return html`<div class="url-details">
        <p>${path}</p>
        <nx-loc-url-details .path="/adobecom/da-bacom${path}"></nx-loc-url-details>
      </div>`;
    });
  }

  renderLocalesFor(lang) {
    return lang.locales.map((locale) => html`<li class="locale ${lang.code}">
      <div class="inner">
        <p>${locale.code}</p>
        <p class="lang-count">${lang.ready}</p>
        <p class="lang-count">${locale.rolledOut}</p>
        <div class="lang-status is-${lang.status.replaceAll(' ', '-')}">${lang.status}</div>
        <button @click=${(e) => this.handleToggleLocaleExpand(locale, e)} class="expand show-urls">Expand</button>
      </div>
      ${this.renderUrlDetails(locale)}
    </li>`);
  }

  renderSummary() {
    return html`<div class="summary">
      <div class="summary-card">
        <p>Total Languages</p>
        <p>${this.langs.length}</p>
      </div>
      <div class="summary-card summary-card-ready">
        <p>Rollout ready</p>
        <p>${this.groupedLangs[0].langs.length}</p>
      </div>
      <div class="summary-card summary-card-waiting">
        <p>Waiting</p>
        <p>${this.groupedLangs[1].langs.length}</p>
      </div>
      <div class="summary-card summary-card-complete">
        <p>Rollout complete</p>
        <p>${this.groupedLangs[2].langs.length}</p>
      </div>
    </div>`;
  }

  renderGroup(langGroup) {
    if (!langGroup.expanded) return nothing;
    return html`<ul>${langGroup.langs.map((lang) => html`
        <li class="language-header is-expanded">
          <div class="inner">
            <p>${lang.name}</p>
            <p class="lang-count">Ready</p>
            <p class="lang-count">Rolled Out</p>
            <div class="lang-status">
              <sl-button @click=${this.handleSendAll} class="primary outline" ?disabled=${lang.status === 'not ready'}>Rollout</sl-button>
            </div>
            <button @click=${(e) => this.handleToggleLangExpand(lang.code, e)} class="expand show-locales">Expand</button>
          </div>
        </li>
        ${this.renderLocalesFor(lang)}`)}</ul>`;
  }

  renderLanguages() {
    return html`
      <div class="nx-loc-list-actions">
        <p class="nx-loc-list-actions-header">Rollout</p>
        <div class="actions">${this.renderRolloutAction()}</div>
      </div>
      ${this.renderSummary()}
      ${this.groupedLangs.map((langGroup) => html`
        <div class="nx-loc-list-header${langGroup.expanded ? ' is-expanded' : ''}">
          <p>${langGroup.title}</p>
          <button @click=${() => this.handleGroupToggle(langGroup)} class="expand show-group">Expand</button>
        </div>
        ${this.renderGroup(langGroup)}
      `)}`;
  }

  render() {
    return html`
      <nx-loc-actions
        @action=${this.handleAction}
        .message=${this._message}
        prev="Translate or copy"
        next="Project complete">
      </nx-loc-actions>
      ${this.renderUrlErrors()}
      ${this.renderLanguages()}
    `;
  }
}

customElements.define('nx-loc-rollout', NxLocRollout);

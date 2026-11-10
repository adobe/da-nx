import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../../nx2/utils/utils.js';
import {
  sortLangs, rolloutLang, markLangInSync, getFilteredLangs, getSummaryCards,
} from './index.js';

const SYNC_LABELS = {
  'to-mark': 'ready to set',
  marked: 'set',
  'in-sync': 'already set',
  missing: 'missing',
  unresolved: 'unresolved review',
  sheet: 'sheets skipped',
  snapshot: 'snapshot pages skipped',
};

const syncSummary = (counts = {}) => Object.entries(SYNC_LABELS)
  .filter(([key]) => counts[key])
  .map(([key, label]) => `${counts[key]} ${label}`)
  .join(', ');

const DA_LIVE = 'https://da.live';
const toEditHref = (path) => `${DA_LIVE}/edit#${path.replace(/\.html$/, '')}`;
const toDisplayPath = (path) => `/${path.split('/').slice(3).join('/').replace(/\.html$/, '')}`;

const localeLabels = (locale, syncCounts) => [
  locale.skipped && `${locale.skipped} skipped (localized)`,
  locale.unchanged && `${locale.unchanged} unchanged`,
  locale.review?.length && `${locale.review.length} ${locale.review.length === 1 ? 'needs' : 'need'} review`,
  syncCounts && syncSummary(syncCounts),
].filter(Boolean);

const style = await loadStyle(import.meta.url);

class NxLocRollout extends LitElement {
  static properties = {
    project: { attribute: false },
    message: { attribute: false },
    _langs: { state: true },
    _urls: { state: true },
    _summaryCards: { state: true },
    _sortedLangs: { state: true },
    _filters: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._langs = this.project.langs;
    this._urls = this.project.urls;
    this._sortedLangs = sortLangs(this._langs);
    this._summaryCards = getSummaryCards();
  }

  update(props) {
    // Allow the parent to pass or clear a message
    if (props.has('message')) this._message = this.message;
    super.update();
  }

  async handleRolloutLang(langToRollout) {
    if (this.anyMarking) return;
    delete langToRollout.sync;
    this._message = { text: `Rolling out ${langToRollout.name}.` };

    const actions = {
      sendMessage: (message) => { this._message = message; },
      requestUpdate: this.requestUpdate.bind(this),
    };

    const rolloutConf = {
      ...this.project,
      lang: langToRollout,
      actions,
    };

    const { message, errors, aborted } = await rolloutLang(rolloutConf);
    if (message || errors) {
      this._message = message;
      this._errors = errors;
      if (aborted) return;
    }

    // Replace the lang from the main list
    // with the one that has updated status info.
    const foundIdx = this._langs.findIndex((lang) => lang.code === langToRollout.code);
    this._langs[foundIdx] = langToRollout;

    // Mark in sync state is for this view only and must not be saved with the project.
    const langs = this._langs.map((lang) => {
      const saved = { ...lang };
      delete saved.sync;
      return saved;
    });
    const opts = { detail: { data: { langs } }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  get canMarkInSync() {
    return this.project.options?.['rollout.conflict.behavior'] === 'smart-overwrite';
  }

  async handleMarkInSync(lang, dryRun) {
    if (this.anyRollout) return;
    const action = dryRun ? 'Checking' : 'Setting';
    this._message = { text: `${action} sync point for ${lang.name}.` };
    const actions = {
      sendMessage: (message) => { this._message = message; },
      requestUpdate: this.requestUpdate.bind(this),
    };
    const { message, errors } = await markLangInSync({
      ...this.project, lang, actions, dryRun,
    });
    this._message = message || { text: `${lang.name}: ${syncSummary(lang.sync) || 'nothing to set'}.` };
    this._errors = errors;
  }

  cancelMarkInSync(lang) {
    delete lang.sync;
    this._message = undefined;
    this.requestUpdate();
  }

  renderMarkInSyncButton(lang) {
    if (!this.canMarkInSync || !this.canLangRollout(lang)) return nothing;
    if (['checking', 'marking', 'checked'].includes(lang.sync?.status)) return nothing;
    return html`<sl-button @click=${() => this.handleMarkInSync(lang, true)} class="primary outline">Set sync point</sl-button>`;
  }

  renderMarkInSyncConfirm(lang) {
    if (!this.canMarkInSync || !this.canLangRollout(lang)) return nothing;
    if (lang.sync?.status !== 'checked') return nothing;
    return html`
      <div class="sync-confirm">
        <p class="sync-summary">${syncSummary(lang.sync)}${lang.sync.differences ? ` (${lang.sync.differences} local-only blocks kept)` : ''}</p>
        <div class="sync-actions">
          <sl-button @click=${() => this.handleMarkInSync(lang, false)} class="primary" ?disabled=${!lang.sync['to-mark']}>Confirm sync point</sl-button>
          <sl-button @click=${() => this.cancelMarkInSync(lang)} class="primary outline">Cancel</sl-button>
        </div>
      </div>`;
  }

  async handleRolloutGroup(group) {
    for (const lang of group.langs) {
      await this.handleRolloutLang(lang);
    }
  }

  handleAction(e) {
    const { href, hash, view } = e.detail;
    const detail = { href, hash };
    if (view) detail.data = { view };

    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  handleLangToggle(lang) {
    lang.expand = !lang.expand;
    this.requestUpdate();
  }

  handleLocaleToggle(locale) {
    locale.expand = !locale.expand;
    this.requestUpdate();
  }

  /**
   * Handles summary button click
   * @param {Object} clicked the card that was clicked
   */
  handleSummaryFilter(clicked) {
    this._summaryCards.forEach((card) => {
      card.styles = [card.styles.shift()];
    });
    clicked.styles.push('is-expanded');
    this._filters = clicked.filter;
  }

  canGroupRollout(group) {
    if (this.anyRollout) return false;
    return group.canRollout;
  }

  canLangRollout(suppliedLang) {
    if (this.anyRollout) return false;
    return suppliedLang.rollout.status !== 'not ready';
  }

  getSummaryCount(filters) {
    if (!filters) return this._sortedLangs.length;
    return this._sortedLangs.filter(
      (lang) => filters.some((filter) => lang.rollout.status === filter),
    ).length;
  }

  get _project() {
    return {
      ...this.project,
      langs: this._langs,
    };
  }

  get anyMarking() {
    return (this._sortedLangs || []).some((lang) => ['checking', 'marking'].includes(lang.sync?.status));
  }

  // Rolling out and marking in sync write the same pages, so they never run at the same time.
  get anyRollout() {
    return this.anyMarking
      || (this._sortedLangs || []).some((lang) => lang.rollout.status === 'rolling out');
  }

  get langGroups() {
    const filteredLangs = getFilteredLangs(this._sortedLangs, this._filters);
    return Object.keys(filteredLangs).map((key) => filteredLangs[key]);
  }

  get _allRolledOut() {
    return this._sortedLangs.every((lang) => lang.rollout?.status === 'complete');
  }

  renderLocale(rollout, locale, sync) {
    const labels = localeLabels(locale, sync?.locales?.[locale.code]);
    return html`
      <li class="locale-item ${locale.expand ? 'is-expanded' : ''}">
        <div class="locale-details">
          <p>${locale.code}${labels.length ? html` <span class="skipped-count">${labels.join(' · ')}</span>` : nothing}</p>
          <p class="sources-count">${this._urls.length}</p>
          <p class="saved-count">${locale.saved || 0}</p>
          <p class="rollout-status">${rollout.status}</p>
        </div>
        ${locale.review?.length ? html`
          <ul class="review-list">
            ${locale.review.map((path) => html`
              <li><a href=${toEditHref(path)} target="_blank" rel="noopener">${toDisplayPath(path)}</a></li>`)}
          </ul>` : nothing}
      </li>`;
  }

  renderLocales(rollout, locales, sync) {
    return html`<ul class="locale-list">
      ${locales.map((locale) => this.renderLocale(rollout, locale, sync))}
    </ul>`;
  }

  renderLang(lang) {
    const canRollout = this.canLangRollout(lang);
    return html`
      <li class="lang-item ${lang.expand ? 'is-expanded' : ''}">
        <div class="lang-item-details">
          <p class="lang-name">${lang.name}</p>
          <p class="sources-count">${this._urls.length}</p>
          <p class="saved-count">${lang.rollout.saved || 0}</p>
          <p class="rollout-status">${lang.rollout.status}</p>
          <div class="lang-actions">
            ${canRollout ? html`<sl-button @click=${() => this.handleRolloutLang(lang)} class="primary outline">Rollout</sl-button>` : nothing}
            ${this.renderMarkInSyncButton(lang)}
          </div>
          <button @click=${() => this.handleLangToggle(lang)} class="expand">Expand language</button>
        </div>
        ${this.renderMarkInSyncConfirm(lang)}
        <div class="lang-item-locales">
          ${lang.expand ? this.renderLocales(lang.rollout, lang.locales, lang.sync) : nothing}
        </div>
      </li>
    `;
  }

  renderLangs(langs) {
    return html`
      <ul class="lang-list ${this.canMarkInSync ? 'can-mark' : ''}">
        ${langs.map((lang) => this.renderLang(lang))}
      </ul>
    `;
  }

  renderGroups() {
    return html`${this.langGroups.map((group) => html`
      <div class="lang-group-header">
        <p class="lang-group-title">${group.title}</p>
        ${this.canGroupRollout(group) ? html`
          <sl-button @click=${() => this.handleRolloutGroup(group)} class="accent">
            ${group.title === 'Complete' ? 'Re-rollout' : 'Rollout'} all ${group.title.toLowerCase()}
          </sl-button>` : nothing}
      </div>
      <div class="lang-group-labels ${this.canMarkInSync ? 'can-mark' : ''}">
        <p>Name</p>
        <p class="sources-count">Sources</p>
        <p class="saved-count">Rolled out</p>
        <p class="rollout-status">Status</p>
      </div>
      ${this.renderLangs(group.langs)}
    `)}`;
  }

  renderErrors() {
    if (!this._errors) return nothing;
    return html`
      <div class="lang-group-header">
        <p class="lang-group-title">Errors</p>
      </div>
      <ul class="lang-list">
        ${this._errors.map((url) => html`<li class="lang-item">
          <div class="lang-item-details lang-item-details-error">
          <p class="lang-name">${url.error}</p>
        </li>`)}
      </ul>
    `;
  }

  renderSummary() {
    return html`
      <div class="summary">
        ${this._summaryCards.map((card) => html`
          <button @click=${() => this.handleSummaryFilter(card)} class="summary-card ${card.styles.join(' ')}">
            <div class="summary-text">
              <p>${card.title}</p>
              <p>${this.getSummaryCount(card.filter)}</p>
            </div>
            <div class="expand"></div>
          </button>
        `)}
      </div>
    `;
  }

  render() {
    return html`
      <nx-loc-actions
        .project=${this._project}
        .message=${this._message}
        @action=${this.handleAction}>
      </nx-loc-actions>
      ${this.renderSummary()}
      ${this.renderErrors()}
      ${this.renderGroups()}
    `;
  }
}

customElements.define('nx-loc-rollout', NxLocRollout);

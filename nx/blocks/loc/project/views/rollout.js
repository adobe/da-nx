import { LitElement, html, nothing } from '../../../../deps/lit/dist/index.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getSvg from '../../../../utils/svg.js';
import getStyle from '../../../../utils/styles.js';
import {
  calculateTime,
  formatDate,
  mergeCopy,
  overwriteCopy,
  saveStatus,
  timeoutWrapper,
} from '../index.js';
import { Queue } from '../../../../public/utils/tree.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const shared = await getStyle(`${nxBase}/blocks/loc/project/views/shared.js`);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

const ICONS = [
  `${nxBase}/blocks/loc/img/Smock_ChevronRight_18_N.svg`,
];

class NxLocRollout extends LitElement {
  static properties = {
    conflictBehavior: { attribute: false },
    details: { attribute: false },
    langs: { attribute: false },
    urls: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, shared, buttons];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    setTimeout(() => { this.toggleExpand(); }, 100);
  }

  toggleExpand() {
    this.shadowRoot.querySelector('.da-loc-panel-expand-btn').classList.toggle('rotate');
    this.shadowRoot.querySelector('.da-loc-panel-content').classList.toggle('is-visible');
  }

  async handleRolloutLang(lang) {
    // Don't rollout if already rolling out
    if (lang.rollout.status === 'rolling out') return;

    const startTime = Date.now();
    lang.rollout.status = 'rolling out';
    lang.rolloutDate = undefined;
    lang.rolloutTime = undefined;
    lang.rolledOut = 0;
    lang.errors = [];
    const items = lang.locales.reduce((acc, locale) => {
      const localeItems = this.urls.map((url) => {
        const source = `${this.sitePath}${lang.location}${url.basePath}`;
        const destination = `${this.sitePath}${locale.code}${url.basePath}`;
        return async () => {
          let resp;
          if (this.conflictBehavior === 'overwrite') {
            resp = await overwriteCopy({ source, destination }, this.title);
          } else {
            resp = await mergeCopy({ source, destination }, this.title);
          }
          if (resp.ok || resp.error === 'timeout') {
            lang.rolledOut += 1;

            if (lang.rolledOut === items.length) {
              lang.rollout.status = 'complete';
              lang.rolloutDate = Date.now();
              lang.rolloutTime = calculateTime(startTime);
            }

            this.requestUpdate();
          } else {
            // eslint-disable-next-line no-console
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
    saveStatus(this.state);
    this.requestUpdate();
  }

  async handleRolloutAll() {
    for (const lang of this.langs) {
      await this.handleRolloutLang(lang);
    }
  }

  getLangStatus(lang) {
    if (lang.rollout.status) return lang.rollout.status;
    if (lang.action === 'rollout') return 'ready';
    return 'not ready';
  }

  canRollout(lang) {
    if (lang.rollout.status === 'ready') return true;
    if (lang.rollout.status === 'complete') return true;
    return false;
  }

  get _totalRollout() {
    const total = this.langs.reduce((acc, lang) => {
      let count = acc;
      count += lang.locales.length * this.urls.length;
      return count;
    }, 0);
    return total.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',');
  }

  get _canRolloutAll() {
    const ready = this.langs.filter((lang) => lang.rollout.status === 'ready' || lang.rollout.status === 'complete');
    return this.langs.length === ready.length;
  }

  renderRolloutDate(lang) {
    if (!lang.rolloutDate) return nothing;
    const { date, time } = formatDate(lang.rolloutDate);
    return html`
      <p class="da-card-date-heading">LAST ROLLOUT ${lang.rolloutTime ? html`- ${lang.rolloutTime}` : nothing}</p>
      <p class="da-card-date">${date} at ${time}</p>
    `;
  }

  render() {
    return html`
      <div class="da-loc-panel">
        <div class="da-loc-panel-title">
          <h3>Rollout <span class="quiet">(${this._totalRollout} items)</span></h3>
          <div class="da-loc-panel-title-expand">
            <h3>Behavior: <span class="quiet">${this.conflictBehavior}</span></h3>
            <button class="da-loc-panel-expand-btn" @click=${this.toggleExpand} aria-label="Toggle Expand"><svg class="icon"><use href="#spectrum-chevronRight"/></svg></button>
          </div>
        </div>
        <div class="da-loc-panel-content">
          <div class="da-lang-cards">
            ${this.langs.map((lang) => html`
              <div class="da-lang-card">
                <div class="da-card-header ${this.getLangStatus(lang).replace(' ', '-')}">
                  <div>
                    <p class="da-card-subtitle">Language</p>
                    <p class="da-card-title">${lang.name}</p>
                  </div>
                  <p class="da-card-badge">${this.getLangStatus(lang)}</p>
                </div>
                <div class="da-card-content">
                  <div class="da-card-details rollout">
                    <div>
                      <p class="da-card-subtitle">Ready</p>
                      <p class="da-card-title">${lang.rollout.ready || 0} of ${this.urls.length}</p>
                    </div>
                    <div>
                      <p class="da-card-subtitle">Rolled out</p>
                      <p class="da-card-title">${lang.rolledOut || 0} of ${this.urls.length * lang.locales.length}</p>
                    </div>
                  </div>
                  <div class="da-card-locales">
                    ${lang.locales.map((locale) => html`<button class="action">${locale.code.replace('/', '')}</button>`)}
                  </div>
                </div>
                <div class="da-card-actions">
                  <div>${this.renderRolloutDate(lang)}</div>
                  <button class="primary" @click=${() => this.handleRolloutLang(lang)} ?disabled=${!this.canRollout(lang)}>Rollout</button>
                </div>
              </div>
            `)}
          </div>
        </div>
        <div class="da-loc-panel-actions">
          <p></p>
          <button class="primary" @click=${this.handleRolloutAll} ?disabled=${!this._canRolloutAll}>Rollout all</button>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-loc-rollout', NxLocRollout);

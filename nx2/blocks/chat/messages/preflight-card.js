import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

class NxPreflightCard extends LitElement {
  static properties = {
    preflight: { attribute: false },
    _isExpanded: { state: true },
    _openCategories: { state: true },
  };

  constructor() {
    super();
    this._isExpanded = true;
    this._openCategories = new Set();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _totalChecks() {
    return (this.preflight?.categories ?? []).reduce((sum, cat) => sum + cat.checks.length, 0);
  }

  _passedChecks() {
    return (this.preflight?.categories ?? []).reduce(
      (sum, cat) => sum + cat.checks.filter((c) => c.passed).length,
      0,
    );
  }

  _toggleCategory(name) {
    const next = new Set(this._openCategories);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    this._openCategories = next;
  }

  _renderChevronIcon() {
    return html`
      <svg class="pf-chevron-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }

  _renderCheckIcon(passed) {
    return passed
      ? html`<svg class="pf-check-icon pf-check-pass" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 10l4.5 4.5L16 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>`
      : html`<svg class="pf-check-icon pf-check-fail" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>`;
  }

  _renderCategory(category) {
    const { name, checks } = category;
    const passed = checks.filter((c) => c.passed).length;
    const isOpen = this._openCategories.has(name);
    const chevronClass = `pf-cat-chevron${isOpen ? ' pf-cat-chevron-open' : ''}`;

    return html`
      <div class="pf-category">
        <button class="pf-cat-header" @click=${() => this._toggleCategory(name)}>
          <span class="pf-cat-name">${name}</span>
          <span class="pf-cat-summary">
            <svg class="pf-cat-pass-icon" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 10l4.5 4.5L16 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
            ${passed}/${checks.length} checks passed
          </span>
          <svg class=${chevronClass} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        ${isOpen ? html`
          <ul class="pf-checks">
            ${checks.map((check) => html`
              <li class="pf-check-row">
                ${this._renderCheckIcon(check.passed)}
                <span class="pf-check-label">${check.label}</span>
              </li>
            `)}
          </ul>
        ` : nothing}
      </div>
    `;
  }

  render() {
    const preflight = this.preflight ?? {};
    const { title = '', readiness = 0, categories = [], summary = '' } = preflight;
    const passed = this._passedChecks();
    const total = this._totalChecks();
    const chevronClass = `pf-icon-btn${this._isExpanded ? ' pf-icon-btn-expanded' : ''}`;

    return html`
      <div class="pf-card">
        <div class="pf-header">
          <span class="pf-type-label">
            <span class="pf-type-icon" aria-hidden="true"></span>
            Pre-flight checker
          </span>
          <button
            type="button"
            class=${chevronClass}
            aria-label=${this._isExpanded ? 'Collapse preflight' : 'Expand preflight'}
            @click=${() => { this._isExpanded = !this._isExpanded; }}
          >${this._renderChevronIcon()}</button>
        </div>

        ${this._isExpanded ? html`
          <div class="pf-body">
            <h3 class="pf-title">${title}</h3>
            <div class="pf-readiness-row">
              <span class="pf-readiness-score">${readiness}% Readiness</span>
              <span class="pf-passed-badge">
                <svg class="pf-badge-icon" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 10l4.5 4.5L16 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                </svg>
                ${passed}/${total} passed
              </span>
            </div>
            <div class="pf-progress-bar" role="progressbar" aria-valuenow=${readiness} aria-valuemin="0" aria-valuemax="100">
              <div class="pf-progress-fill" style="width: ${readiness}%"></div>
            </div>
            <div class="pf-categories">
              ${categories.map((cat) => this._renderCategory(cat))}
            </div>
            ${summary ? html`<p class="pf-summary">${summary}</p>` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }
}

customElements.define('nx-preflight-card', NxPreflightCard);

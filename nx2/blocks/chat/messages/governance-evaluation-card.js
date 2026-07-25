import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { groupChecksByCategory, sectionSummary } from './governance-evaluation-card-data.js';

const styles = await loadStyle(import.meta.url);

class NxGovernanceEvaluationCard extends LitElement {
  static properties = {
    evaluation: { attribute: false },
    _isExpanded: { state: true },
    _openCategories: { state: true },
    _openChecks: { state: true },
    _imageGroupOpen: { state: true },
  };

  constructor() {
    super();
    this._isExpanded = true;
    this._openCategories = new Set();
    this._openChecks = new Set();
    this._imageGroupOpen = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  willUpdate(changedProperties) {
    if (!changedProperties.has('evaluation')) return;
    const sections = [
      ['text', this.evaluation?.text_evaluation],
      ...(this.evaluation?.image_evaluations ?? []).map((img, index) => [`img:${index}`, img]),
    ];
    const next = new Set(this._openChecks);
    sections.forEach(([sectionKey, section]) => {
      (section?.evaluations ?? []).forEach((check) => {
        if (check.alignment === 'NO') {
          const categoryId = check.category_id ?? 'uncategorized';
          next.add(`${sectionKey}:${categoryId}:${check.check_id}`);
        }
      });
    });
    this._openChecks = next;
  }

  _toggleCategory(key) {
    const next = new Set(this._openCategories);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this._openCategories = next;
  }

  _toggleCheck(key) {
    const next = new Set(this._openChecks);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this._openChecks = next;
  }

  _renderChevronIcon() {
    return html`
      <svg class="ge-chevron-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }

  _renderCheckIcon(check) {
    if (check.error) {
      return html`<svg class="ge-check-icon ge-check-error" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 6v5m0 3h.01M2.5 17h15L10 3 2.5 17z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`;
    }
    if (check.alignment === 'YES') {
      return html`<svg class="ge-check-icon ge-check-yes" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 10l4.5 4.5L16 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`;
    }
    if (check.alignment === 'NO') {
      return html`<svg class="ge-check-icon ge-check-no" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`;
    }
    return html`<svg class="ge-check-icon ge-check-na" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 10h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
  }

  _renderSummaryBar(summary) {
    return html`
      <span class="ge-summary-row">
        <span class="ge-passed-badge">${summary.successful}/${summary.successful + summary.failed} passed</span>
      </span>
      <div class="ge-progress-bar" role="progressbar" aria-valuenow=${summary.percent} aria-valuemin="0" aria-valuemax="100">
        <div class="ge-progress-fill" style="width: ${summary.percent}%"></div>
      </div>
    `;
  }

  _renderCheckRow(sectionKey, categoryId, check) {
    const key = `${sectionKey}:${categoryId}:${check.check_id}`;
    const isOpen = this._openChecks.has(key);
    const chevronClass = `ge-check-chevron${isOpen ? ' ge-check-chevron-open' : ''}`;

    return html`
      <li class="ge-check-item">
        <button
          type="button"
          class="ge-check-row"
          aria-expanded=${isOpen}
          @click=${() => this._toggleCheck(key)}
        >
          ${this._renderCheckIcon(check)}
          <span class="ge-check-label">${check.check_title}</span>
          <svg class=${chevronClass} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        ${isOpen ? html`
          <div class="ge-check-detail">
            ${check.reasoning ? html`
              <p class="ge-check-detail-block">
                <span class="ge-check-detail-label">Reasoning</span>
                ${check.reasoning}
              </p>
            ` : nothing}
            ${check.suggestions ? html`
              <p class="ge-check-detail-block ge-check-suggestion">
                <span class="ge-check-detail-label">Suggestion</span>
                ${check.suggestions}
              </p>
            ` : nothing}
          </div>
        ` : nothing}
      </li>
    `;
  }

  _renderCategory(sectionKey, category) {
    const { categoryId, categoryName, checks } = category;
    const key = `${sectionKey}:${categoryId}`;
    const aligned = checks.filter((c) => c.alignment === 'YES').length;
    const isOpen = this._openCategories.has(key);
    const chevronClass = `ge-cat-chevron${isOpen ? ' ge-cat-chevron-open' : ''}`;

    return html`
      <div class="ge-category">
        <button class="ge-cat-header" @click=${() => this._toggleCategory(key)}>
          <span class="ge-cat-name">${categoryName}</span>
          <span class="ge-cat-summary">${aligned}/${checks.length} aligned</span>
          <svg class=${chevronClass} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        ${isOpen ? html`
          <ul class="ge-checks">
            ${checks.map((check) => this._renderCheckRow(sectionKey, categoryId, check))}
          </ul>
        ` : nothing}
      </div>
    `;
  }

  _renderCategories(sectionKey, evaluations) {
    const groups = groupChecksByCategory(evaluations);
    return html`
      <div class="ge-categories">
        ${groups.map((category) => this._renderCategory(sectionKey, category))}
      </div>
    `;
  }

  _renderTextSection(textEvaluation) {
    const evaluations = textEvaluation?.evaluations ?? [];
    return html`
      <div class="ge-section ge-text-section">
        <h4 class="ge-section-title">Text evaluation</h4>
        ${evaluations.length ? html`
          ${this._renderSummaryBar(sectionSummary(textEvaluation))}
          ${this._renderCategories('text', evaluations)}
        ` : html`<p class="ge-section-empty">No text evaluation available.</p>`}
      </div>
    `;
  }

  _renderImageGroup(imageEvaluations) {
    if (!imageEvaluations.length) return nothing;
    const count = imageEvaluations.length;
    const aggregate = imageEvaluations.reduce((acc, img) => {
      const summary = sectionSummary(img);
      return {
        successful: acc.successful + summary.successful,
        failed: acc.failed + summary.failed,
      };
    }, { successful: 0, failed: 0 });
    const imageSummary = sectionSummary({
      successful_checks: aggregate.successful,
      failed_checks: aggregate.failed,
    });
    const isOpen = this._imageGroupOpen;
    const chevronClass = `ge-group-chevron${isOpen ? ' ge-group-chevron-open' : ''}`;

    return html`
      <div class="ge-section ge-image-group">
        <button
          type="button"
          class="ge-group-header"
          aria-expanded=${isOpen}
          @click=${() => { this._imageGroupOpen = !this._imageGroupOpen; }}
        >
          <span class="ge-group-title-col">
            <span class="ge-section-title">Image evaluations</span>
            <span class="ge-group-meta">${count} image${count === 1 ? '' : 's'} evaluated</span>
          </span>
          <span class="ge-group-header-right">
            <span class="ge-passed-badge">${imageSummary.successful}/${imageSummary.successful + imageSummary.failed} passed</span>
            <svg class=${chevronClass} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </button>
        <div class="ge-progress-bar" role="progressbar" aria-valuenow=${imageSummary.percent} aria-valuemin="0" aria-valuemax="100">
          <div class="ge-progress-fill" style="width: ${imageSummary.percent}%"></div>
        </div>
        ${isOpen ? html`
          <div class="ge-image-list">
            ${imageEvaluations.map((img, index) => this._renderImageSection(img, index))}
          </div>
        ` : nothing}
      </div>
    `;
  }

  _renderImageSection(imageEvaluation, index) {
    const { source, overall_aligned: overallAligned, evaluations = [] } = imageEvaluation;
    const badgeClass = `ge-align-badge ${overallAligned ? 'ge-align-badge-pass' : 'ge-align-badge-fail'}`;
    return html`
      <div class="ge-image-section">
        <div class="ge-image-header">
          <img class="ge-image-thumb" src=${source} alt="" />
          <span class=${badgeClass}>${overallAligned ? 'Aligned' : 'Not aligned'}</span>
        </div>
        ${evaluations.length ? html`
          ${this._renderSummaryBar(sectionSummary(imageEvaluation))}
          ${this._renderCategories(`img:${index}`, evaluations)}
        ` : html`<p class="ge-section-empty">No checks available for this image.</p>`}
      </div>
    `;
  }

  render() {
    const evaluation = this.evaluation ?? {};
    const {
      brand_name: brandName = '', pageUrl = '', text_evaluation: textEvaluation, image_evaluations: imageEvaluations = [],
    } = evaluation;
    const chevronClass = `ge-icon-btn${this._isExpanded ? ' ge-icon-btn-expanded' : ''}`;

    const sections = [textEvaluation, ...imageEvaluations].filter(Boolean);
    const aggregate = sections.reduce((acc, section) => {
      const summary = sectionSummary(section);
      return {
        successful: acc.successful + summary.successful,
        failed: acc.failed + summary.failed,
      };
    }, { successful: 0, failed: 0 });
    const aggregateSummary = sectionSummary({
      successful_checks: aggregate.successful,
      failed_checks: aggregate.failed,
    });

    return html`
      <div class="ge-card">
        <div class="ge-header">
          <span class="ge-type-label">
            <span class="ge-type-icon" aria-hidden="true"></span>
            Governance Page Evaluation
          </span>
          <button
            type="button"
            class=${chevronClass}
            aria-label=${this._isExpanded ? 'Collapse evaluation' : 'Expand evaluation'}
            @click=${() => { this._isExpanded = !this._isExpanded; }}
          >${this._renderChevronIcon()}</button>
        </div>

        ${this._isExpanded ? html`
          <div class="ge-body">
            <h3 class="ge-title">${brandName || 'Brand evaluation'}</h3>
            ${pageUrl ? html`<p class="ge-page-url">${pageUrl}</p>` : nothing}
            ${this._renderSummaryBar(aggregateSummary)}
            ${this._renderTextSection(textEvaluation)}
            ${this._renderImageGroup(imageEvaluations)}
          </div>
        ` : nothing}
      </div>
    `;
  }
}

customElements.define('nx-governance-evaluation-card', NxGovernanceEvaluationCard);

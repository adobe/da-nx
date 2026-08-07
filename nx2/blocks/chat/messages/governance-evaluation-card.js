import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { getConfig } from '../../../scripts/nx.js';
import { groupChecksByCategory, sectionSummary } from './governance-evaluation-card-data.js';

const shared = await loadStyle(new URL('./messages.css', import.meta.url).href);
const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

const ICON_NAMES = {
  chevron: 's2-icon-chevrondown-20-n',
  check: 's2-icon-checkmark-20-n',
  close: 's2-icon-close-20-n',
  warning: 's2-icon-alertdiamond-20-n',
  na: 's2-icon-circle-20-n',
};

const icon = (name, className) => html`<svg class=${className} viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${ICON_NAMES[name]}.svg#icon"></use></svg>`;

class NxGovernanceEvaluationCard extends LitElement {
  static properties = {
    evaluation: { attribute: false },
    loading: { type: Boolean },
    error: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [shared, styles];
  }

  _renderCheckIcon(check) {
    if (check.error) return icon('warning', 'ge-check-icon ge-check-error');
    if (check.alignment === 'YES') return icon('check', 'ge-check-icon ge-check-yes');
    if (check.alignment === 'NO') return icon('close', 'ge-check-icon ge-check-no');
    return icon('na', 'ge-check-icon ge-check-na');
  }

  _renderSummaryBar(summary) {
    return html`
      <span class="ge-summary-row">
        <span class="ge-passed-badge">${summary.successful}/${summary.successful + summary.failed} passed</span>
      </span>
      <progress class="ge-progress-bar" value=${summary.percent} max="100">${summary.percent}%</progress>
    `;
  }

  _renderCheckRow(check) {
    return html`
      <details class="ge-check-item" ?open=${check.alignment === 'NO'}>
        <summary class="ge-check-row">
          ${this._renderCheckIcon(check)}
          <span class="ge-check-label">${check.check_title}</span>
          ${icon('chevron', 'ge-check-chevron')}
        </summary>
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
      </details>
    `;
  }

  _renderCategory(category) {
    const { categoryName, checks } = category;
    const aligned = checks.filter((c) => c.alignment === 'YES').length;

    return html`
      <details class="ge-category">
        <summary class="ge-cat-header">
          <span class="ge-cat-name">${categoryName}</span>
          <span class="ge-cat-summary">${aligned}/${checks.length} aligned</span>
          ${icon('chevron', 'ge-cat-chevron')}
        </summary>
        <div class="ge-checks">
          ${checks.map((check) => this._renderCheckRow(check))}
        </div>
      </details>
    `;
  }

  _renderCategories(evaluations) {
    const groups = groupChecksByCategory(evaluations);
    return html`
      <div class="ge-categories">
        ${groups.map((category) => this._renderCategory(category))}
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
          ${this._renderCategories(evaluations)}
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

    return html`
      <details class="ge-section ge-image-group">
        <summary class="ge-group-header">
          <span class="ge-group-title-col">
            <span class="ge-section-title">Image evaluations</span>
            <span class="ge-group-meta">${count} image${count === 1 ? '' : 's'} evaluated</span>
          </span>
          <span class="ge-group-header-right">
            <span class="ge-passed-badge">${imageSummary.successful}/${imageSummary.successful + imageSummary.failed} passed</span>
            ${icon('chevron', 'ge-group-chevron')}
          </span>
        </summary>
        <progress class="ge-progress-bar" value=${imageSummary.percent} max="100">${imageSummary.percent}%</progress>
        <div class="ge-image-list">
          ${imageEvaluations.map((img) => this._renderImageSection(img))}
        </div>
      </details>
    `;
  }

  _renderImageSection(imageEvaluation) {
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
          ${this._renderCategories(evaluations)}
        ` : html`<p class="ge-section-empty">No checks available for this image.</p>`}
      </div>
    `;
  }

  render() {
    if (this.error) {
      return html`
        <div class="msg-card ge-card">
          <div class="msg-card-header ge-header">
            <span class="msg-type-label">
              <span class="msg-type-icon ge-type-icon ge-type-icon-error" aria-hidden="true"></span>
              Governance Page Evaluation
            </span>
          </div>
          <div class="ge-body ge-error">
            ${icon('warning', 'ge-error-icon')}
            <span class="ge-error-text">${this.error}</span>
          </div>
        </div>
      `;
    }

    if (this.loading) {
      return html`
        <div class="msg-card ge-card">
          <div class="msg-card-header ge-header">
            <span class="msg-type-label">
              <span class="msg-type-icon ge-type-icon" aria-hidden="true"></span>
              Governance Page Evaluation
            </span>
          </div>
          <div class="ge-body ge-loading">
            <span class="msg-spinner" aria-hidden="true"></span>
            <span class="ge-loading-text">Evaluating page…</span>
          </div>
        </div>
      `;
    }

    const evaluation = this.evaluation ?? {};
    const {
      brand_name: brandName = '', pageUrl = '', text_evaluation: textEvaluation, image_evaluations: imageEvaluations = [],
    } = evaluation;

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
      <details class="msg-card ge-card" open>
        <summary class="msg-card-header ge-header">
          <span class="msg-type-label">
            <span class="msg-type-icon ge-type-icon" aria-hidden="true"></span>
            Governance Page Evaluation
          </span>
          ${icon('chevron', 'msg-chevron ge-chevron-icon')}
        </summary>
        <div class="ge-body">
          <h3 class="msg-title">${brandName || 'Brand evaluation'}</h3>
          ${pageUrl ? html`<p class="ge-page-url">${pageUrl}</p>` : nothing}
          ${this._renderSummaryBar(aggregateSummary)}
          ${this._renderTextSection(textEvaluation)}
          ${this._renderImageGroup(imageEvaluations)}
        </div>
      </details>
    `;
  }
}

customElements.define('nx-governance-evaluation-card', NxGovernanceEvaluationCard);

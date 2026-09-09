/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { registerArtifact } from './registry.js';

const styles = await loadStyle(import.meta.url);

const PAGE_SIZE = 5;

const TONE_MAP = {
  negative: { cls: 'negative' },
  positive: { cls: 'positive' },
  neutral: { cls: 'neutral' },
};
const TONE_FALLBACK = { cls: 'informative' };

const toneOf = (tone) => TONE_MAP[tone] ?? TONE_FALLBACK;

const toneIcon = (tone) => {
  const { cls } = toneOf(tone);
  return html`<span class="ui-artifact-pe-icon ui-artifact-pe-tone-${cls}"></span>`;
};

/* ---- summary ---- */

function renderTile({ label = '', value = '', description = '', tone }) {
  const { cls } = toneOf(tone);
  return html`
    <div class="ui-artifact-pe-tile">
      <span class="ui-artifact-pe-tile-label">${label}</span>
      <span class="ui-artifact-pe-tile-value ui-artifact-pe-tone-${cls}">${value}</span>
      ${description ? html`<span class="ui-artifact-pe-tile-desc">${description}</span>` : nothing}
    </div>
  `;
}

function renderSummary(summary) {
  return html`
    <div class="ui-artifact-pe-summary">${summary.map(renderTile)}</div>
  `;
}

/* ---- modal bodies ---- */

function renderContextCard(context) {
  if (!context) return nothing;
  return html`
    <div class="ui-artifact-pe-modal-context-card">
      ${context.category ? html`<span class="ui-artifact-pe-modal-chip">${context.category}</span>` : nothing}
      ${context.description ? html`<p class="ui-artifact-pe-modal-context-desc">${context.description}</p>` : nothing}
    </div>
  `;
}

function renderSuggestionBody(item) {
  const { suggestion } = item;
  if (!suggestion) return nothing;
  return html`
    ${suggestion.label ? html`<h3 class="ui-artifact-pe-modal-asset-label">${suggestion.label}</h3>` : nothing}
    <div class="ui-artifact-pe-modal-section">
      <div class="ui-artifact-pe-modal-heading">
        <span class="ui-artifact-pe-modal-heading-icon issue"></span>
        <span class="ui-artifact-pe-modal-heading-text">Issue identified</span>
      </div>
      ${suggestion.issue ? html`<p class="ui-artifact-pe-modal-body">${suggestion.issue}</p>` : nothing}
    </div>
    <div class="ui-artifact-pe-modal-section">
      <div class="ui-artifact-pe-modal-heading">
        <span class="ui-artifact-pe-modal-heading-icon fix"></span>
        <span class="ui-artifact-pe-modal-heading-text">Suggested change</span>
      </div>
      ${suggestion.suggested ? html`<p class="ui-artifact-pe-modal-body">${suggestion.suggested}</p>` : nothing}
      <button class="ui-artifact-pe-modal-copy" @click=${() => navigator.clipboard.writeText(suggestion.suggested ?? '')}>
        <span class="ui-artifact-pe-modal-copy-icon"></span>Copy suggestion
      </button>
    </div>
    ${suggestion.context ? html`
      <div class="ui-artifact-pe-modal-context-title">Context</div>
      ${renderContextCard(suggestion.context)}
    ` : nothing}
  `;
}

function renderCheckBody(item) {
  const { check } = item;
  if (!check) return nothing;
  return html`
    ${check.label ? html`<h3 class="ui-artifact-pe-modal-asset-label">${check.label}</h3>` : nothing}
    ${item.description ? html`
      <div class="ui-artifact-pe-modal-section">
        <p class="ui-artifact-pe-modal-body">${item.description}</p>
      </div>
    ` : nothing}
    ${check.context ? html`
      <div class="ui-artifact-pe-modal-context-title">Context</div>
      ${renderContextCard(check.context)}
    ` : nothing}
  `;
}

/* ---- section labels ---- */

function sectionLabelFromTone(tone) {
  if (tone === 'negative') return 'failures';
  if (tone === 'positive') return 'passes';
  return 'checks';
}

class NxPageEval extends LitElement {
  static properties = {
    data: { attribute: false },
    _pages: { state: true },
    _modal: { state: true },
  };

  constructor() {
    super();
    this._pages = {};
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _setPage(sectionIndex, page, total) {
    if (page < 0 || page * PAGE_SIZE >= total) return;
    this._pages = { ...this._pages, [sectionIndex]: page };
  }

  async _openModal(item, items, tone, componentTitle) {
    let kind;
    let filtered;
    if (item.suggestion) {
      kind = 'suggestion';
      filtered = items.filter((it) => it.suggestion);
    } else if (item.check) {
      kind = 'check';
      filtered = items.filter((it) => it.check);
    } else {
      return;
    }
    if (!filtered.length) return;
    const idx = filtered.indexOf(item);
    await import('../../shared/dialog/dialog.js');
    this._modal = {
      kind,
      items: filtered,
      index: idx >= 0 ? idx : 0,
      sectionLabel: sectionLabelFromTone(tone),
      title: componentTitle || 'Page evaluation',
    };
  }

  _setModalIndex(index) {
    if (!this._modal || index < 0 || index >= this._modal.items.length) return;
    this._modal = { ...this._modal, index };
  }

  _renderItem(item, tone, hidden, onAction) {
    return html`
      <div class="ui-artifact-pe-item" ?hidden=${hidden}>
        <span class="ui-artifact-pe-item-chip">${toneIcon(tone)}</span>
        <div class="ui-artifact-pe-item-body">
          <span class="ui-artifact-pe-item-title">${item.title ?? ''}</span>
          ${item.description
    ? html`<span class="ui-artifact-pe-item-desc">${item.description}</span>`
    : nothing}
        </div>
        ${item.suggestion ? html`
          <button class="ui-artifact-pe-item-action" @click=${onAction}>View suggestions</button>
        ` : nothing}
        ${!item.suggestion && item.check ? html`
          <button class="ui-artifact-pe-item-action" @click=${onAction}>View</button>
        ` : nothing}
      </div>
    `;
  }

  _renderPaging(sectionIndex, end, total) {
    const page = this._pages[sectionIndex] ?? 0;
    return html`
      <div class="ui-artifact-pe-paging">
        <button
          class="ui-artifact-pe-paging-btn ui-artifact-pe-paging-prev"
          aria-label="Previous checks"
          ?disabled=${page === 0}
          @click=${() => this._setPage(sectionIndex, page - 1, total)}
        ></button>
        <span class="ui-artifact-pe-paging-label">${end} of ${total} checks</span>
        <button
          class="ui-artifact-pe-paging-btn ui-artifact-pe-paging-next"
          aria-label="Next checks"
          ?disabled=${end >= total}
          @click=${() => this._setPage(sectionIndex, page + 1, total)}
        ></button>
      </div>
    `;
  }

  _renderItems(items, tone, sectionIndex, componentTitle) {
    const total = items.length;
    const page = this._pages[sectionIndex] ?? 0;
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, total);
    return html`
      <div class="ui-artifact-pe-items">
        ${items.map((item, i) => this._renderItem(
    item,
    tone,
    i < start || i >= end,
    () => this._openModal(item, items, tone, componentTitle),
  ))}
        ${total > PAGE_SIZE ? this._renderPaging(sectionIndex, end, total) : nothing}
      </div>
    `;
  }

  _renderSection(section, sectionIndex, componentTitle) {
    const {
      label = '', subLabel = '', tone, defaultOpen = false, items = [],
    } = section;
    const { cls } = toneOf(tone);
    return html`
      <details class="ui-artifact-pe-section" ?open=${defaultOpen}>
        <summary class="ui-artifact-pe-section-header">
          <span class="ui-artifact-pe-section-chip ui-artifact-pe-tone-${cls}-bg">
            ${toneIcon(tone)}
          </span>
          <div class="ui-artifact-pe-section-labels">
            <span class="ui-artifact-pe-section-label">${label}</span>
            ${subLabel ? html`<span class="ui-artifact-pe-section-sublabel">${subLabel}</span>` : nothing}
          </div>
          <span class="ui-artifact-pe-chevron"></span>
        </summary>
        ${items.length ? this._renderItems(items, tone, sectionIndex, componentTitle) : nothing}
      </details>
    `;
  }

  _renderModal() {
    const {
      kind, items, index, sectionLabel, title,
    } = this._modal;
    const total = items.length;
    const renderBody = kind === 'suggestion' ? renderSuggestionBody : renderCheckBody;
    return html`
      <nx-dialog
        .title=${title}
        style="--nx-dialog-max-width: 600px"
        @close=${() => { this._modal = undefined; }}
      >
        <div class="ui-artifact-pe-modal-content">
          ${renderBody(items[index])}
          <div class="ui-artifact-pe-modal-paging">
            <button
              class="ui-artifact-pe-modal-paging-btn ui-artifact-pe-modal-paging-prev"
              aria-label="Previous"
              ?disabled=${index === 0}
              @click=${() => this._setModalIndex(index - 1)}
            ></button>
            <span class="ui-artifact-pe-modal-paging-label">
              ${index + 1} of ${total} ${sectionLabel}
            </span>
            <button
              class="ui-artifact-pe-modal-paging-btn ui-artifact-pe-modal-paging-next"
              aria-label="Next"
              ?disabled=${index >= total - 1}
              @click=${() => this._setModalIndex(index + 1)}
            ></button>
          </div>
        </div>
      </nx-dialog>
    `;
  }

  render() {
    if (!this.data) return nothing;
    const { title = '', summary = [], sections = [] } = this.data;
    return html`
      <div class="ui-artifact-pe">
        ${summary.length ? renderSummary(summary) : nothing}
        ${sections.map((s, i) => this._renderSection(s, i, title))}
      </div>
      ${this._modal ? this._renderModal() : nothing}
    `;
  }
}

if (!customElements.get('nx-page-eval')) customElements.define('nx-page-eval', NxPageEval);

registerArtifact('PageEvaluationWithIcons', (props) => html`
  <nx-page-eval .data=${props}></nx-page-eval>
`);

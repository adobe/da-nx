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
import { EVAL_EVENT } from '../../../utils/evaluation-events.js';
import { registerArtifact } from './registry.js';
import { canSuggest, toEvalGroup, buildFallbackMessage } from './suggest-element.js';
import { pageIdentity } from '../utils/evaluated-page.js';

const styles = await loadStyle(import.meta.url);

const PAGE_SIZE = 5;
// A request that never made the chat busy (nothing was sent) frees its button after this.
const REQUEST_GRACE_MS = 15000;

const PUBLIC_ICONS = new URL('../../../public/icons/', import.meta.url).href;
const ICON_VARS = {
  '--nx-pe-icon-close-circle': `${PUBLIC_ICONS}S2_Icon_CloseCircle_20_N.svg`,
  '--nx-pe-icon-checkmark-circle': `${PUBLIC_ICONS}S2_Icon_CheckmarkCircle_20_N.svg`,
  '--nx-pe-icon-info-circle': `${PUBLIC_ICONS}S2_Icon_InfoCircle_20_N.svg`,
  '--nx-pe-icon-chevron-down': `${PUBLIC_ICONS}S2_Icon_ChevronDown_20_N.svg`,
  '--nx-pe-icon-chevron-left': `${PUBLIC_ICONS}S2_Icon_ChevronLeft_20_N.svg`,
  '--nx-pe-icon-ai-sparkles': `${PUBLIC_ICONS}S2_Icon_AISparkles_20_N.svg`,
  '--nx-pe-icon-copy': `${PUBLIC_ICONS}S2_Icon_Copy_20_N.svg`,
  '--nx-pe-icon-chevron-up': new URL('../../../img/icons/S2_Icon_ChevronUp_20_N.svg', import.meta.url).href,
};

const TONE_MAP = {
  negative: { cls: 'negative' },
  positive: { cls: 'positive' },
  neutral: { cls: 'neutral' },
};
const TONE_FALLBACK = { cls: 'informative' };

const toneOf = (tone) => TONE_MAP[tone] ?? TONE_FALLBACK;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Sections the skill emits per page element ("el-<element_id>"),
// grouped under one Failures card.
const isElementSection = (section) => section.tone === 'negative'
  && typeof section.key === 'string' && section.key.startsWith('el-');

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

/* ---- findings (see docs/evaluation-findings.md) ---- */

const findingId = (item, sectionIndex, itemIndex) => item.id ?? `${sectionIndex}-${itemIndex}`;

function toEvalFinding(item, id) {
  const { suggestion } = item;
  return {
    id,
    title: item.title,
    ...(item.description !== undefined && { description: item.description }),
    ...(suggestion.label !== undefined && { label: suggestion.label }),
    ...(suggestion.assetType !== undefined && { assetType: suggestion.assetType }),
    ...(suggestion.issue !== undefined && { issue: suggestion.issue }),
    ...(suggestion.suggested !== undefined && { suggested: suggestion.suggested }),
    ...(suggestion.context !== undefined && { context: suggestion.context }),
    evidence: suggestion.evidence ?? [],
  };
}

function hasResolvableEvidence(finding) {
  return (finding?.evidence ?? []).some((e) => (
    (e?.anchorType === 'text' && e.anchorText)
    || (e?.anchorType === 'image' && e.src)
  ));
}

// One finding per item that has a `suggestion`, across all sections, in order.
export function toEvalFindings(data) {
  return (data?.sections ?? []).flatMap((section, sectionIndex) => (
    (section.items ?? []).flatMap((item, itemIndex) => (
      item.suggestion ? [toEvalFinding(item, findingId(item, sectionIndex, itemIndex))] : []
    ))
  ));
}

// Returns true when a host on the page (e.g. the canvas) claimed the finding.
function focusFinding(data, id) {
  const findings = toEvalFindings(data);
  const finding = findings.find((f) => f.id === id);
  if (!hasResolvableEvidence(finding)) return false;
  const event = new CustomEvent(EVAL_EVENT.FOCUS_FINDING, {
    cancelable: true,
    detail: { findingId: id, findings },
  });
  document.dispatchEvent(event);
  return event.defaultPrevented;
}

// One finding per failing check of an element section; ids match `toEvalFindings`.
function sectionFindings(section, sectionIndex) {
  return (section.items ?? []).flatMap((item, itemIndex) => (
    item.suggestion ? [toEvalFinding(item, findingId(item, sectionIndex, itemIndex))] : []
  ));
}

// "Generate suggestion": a host that can read the element claims the event and sends the
// request itself; otherwise a plain request built from the artifact goes to the chat.
async function suggestElement({ data, sectionIndex, evaluatedUrl }) {
  const section = data.sections[sectionIndex];
  const group = toEvalGroup({ section, findings: sectionFindings(section, sectionIndex) });
  const event = new CustomEvent(EVAL_EVENT.SUGGEST_ELEMENT, {
    cancelable: true,
    detail: { group, ...(evaluatedUrl && { evaluatedUrl }) },
  });
  document.dispatchEvent(event);
  if (event.defaultPrevented) return;
  const { CHAT_EVENT } = await import('../../../utils/chat.js');
  const text = buildFallbackMessage({ group, evaluatedUrl });
  const detail = { text, autoSend: true };
  document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, { detail }));
}

/* ---- newer evaluation replaces this card ---- */

// Every mounted card, to find out whether a later card evaluates the same page.
const mounted = new Set();
const order = new WeakMap();
let sequence = 0;

function follows(later, earlier) {
  const root = later.getRootNode();
  if (root !== earlier.getRootNode()) return order.get(later) > order.get(earlier);
  const cards = [...root.querySelectorAll('nx-page-eval')];
  return cards.indexOf(later) > cards.indexOf(earlier);
}

const isSuperseded = (card) => !!card.evalKey && [...mounted]
  .some((other) => other !== card && other.evalKey === card.evalKey && follows(other, card));

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
    evalKey: { type: String },
    evaluatedUrl: { type: String },
    busy: { type: Boolean },
    _modal: { state: true },
    _selected: { state: true },
    _requested: { state: true },
    _showSuperseded: { state: true },
  };

  _timers = new Map();

  constructor() {
    super();
    this._pages = {};
    this._requested = {};
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    Object.entries(ICON_VARS).forEach(([name, href]) => this.style.setProperty(name, `url("${href}")`));
    sequence += 1;
    order.set(this, sequence);
    mounted.add(this);
    mounted.forEach((card) => card.requestUpdate());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    mounted.delete(this);
    this._timers.forEach((timer) => clearTimeout(timer));
    this._timers.clear();
    mounted.forEach((card) => card.requestUpdate());
  }

  willUpdate(changed) {
    if (changed.has('evalKey')) mounted.forEach((card) => card.requestUpdate());
    const superseded = isSuperseded(this);
    // Lets artifacts.css hide the card title above the one-line stand-in.
    this.toggleAttribute('superseded', superseded && !this._showSuperseded);
    if (superseded) this._requested = {};
    else if (changed.has('busy') && Object.keys(this._requested).length) this._trackBusy();
  }

  // A request keeps its button disabled for as long as the chat is busy with it. Once that turn
  // ends without a newer card (skipped, failed) the button is available again.
  _trackBusy() {
    const next = {};
    Object.entries(this._requested).forEach(([key, req]) => {
      if (this.busy) next[key] = { sawBusy: true };
      else if (!req.sawBusy) next[key] = req;
    });
    this._requested = next;
  }

  _requestSuggestion(section, sectionIndex) {
    const { key } = section;
    this._requested = { ...this._requested, [key]: { sawBusy: !!this.busy } };
    clearTimeout(this._timers.get(key));
    this._timers.set(key, setTimeout(() => {
      if (!this._requested[key] || this._requested[key].sawBusy) return;
      this._requested = Object.fromEntries(
        Object.entries(this._requested).filter(([k]) => k !== key),
      );
    }, REQUEST_GRACE_MS));
    suggestElement({ data: this.data, sectionIndex, evaluatedUrl: this.evaluatedUrl });
  }

  _setPage(sectionIndex, page, total) {
    if (page < 0 || page * PAGE_SIZE >= total) return;
    this._pages = { ...this._pages, [sectionIndex]: page };
  }

  async _openModal(item, items, tone, componentTitle, sectionIndex) {
    const id = findingId(item, sectionIndex, items.indexOf(item));
    if (item.suggestion && focusFinding(this.data, id)) {
      this._selected = id;
      return;
    }
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

  _renderItem(item, hidden, onAction, selected) {
    return html`
      <div class="ui-artifact-pe-item" ?hidden=${hidden}>
        <div class="ui-artifact-pe-item-body">
          <span class="ui-artifact-pe-item-title">${item.title ?? ''}</span>
          ${item.description
    ? html`<span class="ui-artifact-pe-item-desc">${item.description}</span>`
    : nothing}
        </div>
        ${item.suggestion ? html`
          <button
            class="ui-artifact-pe-item-action ${selected ? 'selected' : ''}"
            aria-pressed=${selected ? 'true' : 'false'}
            @click=${onAction}
          >View failure</button>
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
    i < start || i >= end,
    () => this._openModal(item, items, tone, componentTitle, sectionIndex),
    this._selected !== undefined && this._selected === findingId(item, sectionIndex, i),
  ))}
        ${total > PAGE_SIZE ? this._renderPaging(sectionIndex, end, total) : nothing}
      </div>
    `;
  }

  _renderCard({
    tone, label, subLabel, defaultOpen, content,
  }) {
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
        ${content}
      </details>
    `;
  }

  _renderSection(section, sectionIndex, componentTitle) {
    const {
      label = '', subLabel = '', tone, defaultOpen = false, items = [],
    } = section;
    return this._renderCard({
      tone,
      label,
      subLabel,
      defaultOpen,
      content: items.length
        ? this._renderItems(items, tone, sectionIndex, componentTitle)
        : nothing,
    });
  }

  _renderGenerate(section, sectionIndex) {
    const generating = !!this._requested[section.key];
    return html`
      <button
        type="button"
        class="ui-artifact-pe-generate ${generating ? 'generating' : ''}"
        ?disabled=${generating}
        @click=${(e) => {
    e.preventDefault();
    e.stopPropagation();
    this._requestSuggestion(section, sectionIndex);
  }}
      >
        <span class="ui-artifact-pe-generate-icon"></span>
        ${generating ? 'Generating suggestions…' : 'Generate suggestion'}
      </button>
    `;
  }

  _renderElement({ section, sectionIndex }, componentTitle) {
    const {
      label = '', tone, defaultOpen = false, items = [],
    } = section;
    return html`
      <details class="ui-artifact-pe-el" ?open=${defaultOpen}>
        <summary class="ui-artifact-pe-el-row">
          ${toneIcon(tone)}
          <div class="ui-artifact-pe-el-text">
            <span class="ui-artifact-pe-el-line">
              <span class="ui-artifact-pe-el-name">${label}</span>
              <span class="ui-artifact-pe-badge">${plural(items.length, 'failure', 'failures')}</span>
            </span>
            <span class="ui-artifact-pe-el-sub">${plural(items.length, 'check', 'checks')} failed</span>
          </div>
          ${canSuggest(section) ? this._renderGenerate(section, sectionIndex) : nothing}
          <span class="ui-artifact-pe-el-chevron"></span>
        </summary>
        ${items.length ? this._renderItems(items, tone, sectionIndex, componentTitle) : nothing}
      </details>
    `;
  }

  _renderFailures(elements, componentTitle) {
    return this._renderCard({
      tone: 'negative',
      label: 'Failures',
      subLabel: `${plural(elements.length, 'element', 'elements')} failed`,
      defaultOpen: elements.some(({ section }) => section.defaultOpen),
      content: html`
        <div class="ui-artifact-pe-elements">
          ${elements.map((entry) => this._renderElement(entry, componentTitle))}
        </div>
      `,
    });
  }

  _renderSections(sections, componentTitle) {
    const entries = sections.map((section, sectionIndex) => ({ section, sectionIndex }));
    const elements = entries.filter(({ section }) => isElementSection(section));
    return entries.map((entry) => {
      if (!isElementSection(entry.section)) {
        return this._renderSection(entry.section, entry.sectionIndex, componentTitle);
      }
      return entry === elements[0] ? this._renderFailures(elements, componentTitle) : nothing;
    });
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

  _renderSuperseded() {
    return html`
      <button
        type="button"
        class="ui-artifact-pe-superseded"
        aria-expanded=${this._showSuperseded ? 'true' : 'false'}
        @click=${() => { this._showSuperseded = !this._showSuperseded; }}
      >
        <span class="ui-artifact-pe-superseded-chevron"></span>
        Superseded by a newer evaluation
      </button>
    `;
  }

  render() {
    if (!this.data) return nothing;
    const { title = '', summary = [], sections = [] } = this.data;
    const superseded = isSuperseded(this);
    if (superseded && !this._showSuperseded) return this._renderSuperseded();
    return html`
      ${superseded ? this._renderSuperseded() : nothing}
      <div class="ui-artifact-pe">
        ${summary.length ? renderSummary(summary) : nothing}
        ${this._renderSections(sections, title)}
      </div>
      ${this._modal ? this._renderModal() : nothing}
    `;
  }
}

if (!customElements.get('nx-page-eval')) customElements.define('nx-page-eval', NxPageEval);

// `ctx.evaluatedUrl` is the page the user asked to evaluate (see chat-ao's `evaluatedPages`);
// the card's own `url` wins when the agent provided one.
registerArtifact('PageEvaluationWithIcons', (props, ctx = {}) => {
  const evaluatedUrl = props.url ?? ctx.evaluatedUrl;
  const evalKey = (evaluatedUrl && pageIdentity(evaluatedUrl)) || `title:${props.title ?? ''}`;
  return html`
    <nx-page-eval
      .data=${props}
      .evalKey=${evalKey}
      .evaluatedUrl=${evaluatedUrl}
      .busy=${!!ctx.busy}
    ></nx-page-eval>
  `;
});

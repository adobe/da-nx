import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';

const PAGE_SIZE = 5;

const TONE_MAP = {
  negative: { cls: 'negative', icon: 's2-icon-closecircle-20-n' },
  positive: { cls: 'positive', icon: 's2-icon-checkmarkcircle-20-n' },
  neutral: { cls: 'neutral', icon: 's2-icon-removecircle-20-n' },
};
const TONE_FALLBACK = { cls: 'informative', icon: 's2-icon-infocircle-20-n' };

const toneOf = (tone) => TONE_MAP[tone] ?? TONE_FALLBACK;

const iconUrl = (name) => `/img/icons/${name}.svg`;

const toneIcon = (tone, size = 20) => {
  const { icon, cls } = toneOf(tone);
  return html`<span
    class="ui-artifact-pe-icon ui-artifact-pe-tone-${cls}"
    style="--pe-icon:url('${iconUrl(icon)}');width:${size}px;height:${size}px"
  ></span>`;
};

/* ---- lazy CSS adoption ---- */

const PE_STYLE_URL = new URL('./page-evaluation.css', import.meta.url).href;
let styleSheet;
let styleAdopted;

function adoptStyle(host) {
  if (styleAdopted) return;
  styleAdopted = true;
  (async () => {
    // eslint-disable-next-line import/no-unresolved
    const { loadStyle } = await import('../../../utils/utils.js');
    styleSheet = await loadStyle(PE_STYLE_URL);
    const root = host?.getRootNode?.();
    if (root?.adoptedStyleSheets && !root.adoptedStyleSheets.includes(styleSheet)) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, styleSheet];
    }
  })();
}

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

/* ---- inline pagination ---- */

function updatePage(container, page) {
  const items = container.querySelectorAll('.ui-artifact-pe-item');
  const total = items.length;
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  items.forEach((row, i) => { row.hidden = i < start || i >= end; });
  const label = container.querySelector('.ui-artifact-pe-paging-label');
  if (label) label.textContent = `${end} of ${total} checks`;
  const prev = container.querySelector('.ui-artifact-pe-paging-prev');
  const next = container.querySelector('.ui-artifact-pe-paging-next');
  if (prev) prev.disabled = page === 0;
  if (next) next.disabled = end >= total;
  container.dataset.page = page;
}

const onPage = (dir) => (e) => {
  const container = e.target.closest('.ui-artifact-pe-items');
  const page = Number(container.dataset.page) + dir;
  const total = container.querySelectorAll('.ui-artifact-pe-item').length;
  if (page < 0 || page * PAGE_SIZE >= total) return;
  updatePage(container, page);
};

function renderPaging(total) {
  const shown = Math.min(PAGE_SIZE, total);
  return html`
    <div class="ui-artifact-pe-paging">
      <button class="ui-artifact-pe-paging-btn ui-artifact-pe-paging-prev" disabled @click=${onPage(-1)}></button>
      <span class="ui-artifact-pe-paging-label">${shown} of ${total} checks</span>
      <button class="ui-artifact-pe-paging-btn ui-artifact-pe-paging-next" @click=${onPage(1)}></button>
    </div>
  `;
}

/* ---- modals ---- */

const MODAL_STYLES = `
  .pe-modal-content { font-family: var(--s2-font-family, 'Adobe Clean', adobe-clean, sans-serif); }
  .pe-modal-asset-label { font-size: 18px; font-weight: bold; color: #222; margin: 0 0 16px; }
  .pe-modal-section { margin-bottom: 20px; }
  .pe-modal-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .pe-modal-heading-icon {
    width: 20px; height: 20px; flex-shrink: 0;
    background-color: currentcolor;
    mask-size: contain; mask-repeat: no-repeat; mask-position: center;
  }
  .pe-modal-heading-icon.issue { color: #c05621; mask-image: url('/img/icons/s2-icon-closecircle-20-n.svg'); }
  .pe-modal-heading-icon.fix { color: #107c41; mask-image: url('/img/icons/s2-icon-checkmarkcircle-20-n.svg'); }
  .pe-modal-heading-text { font-weight: bold; font-size: 14px; color: #222; }
  .pe-modal-body { font-size: 14px; line-height: 1.6; color: #4b4b4b; margin: 0; }
  .pe-modal-copy {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 13px; color: #4b4b4b; background: none; border: none;
    cursor: pointer; padding: 4px 0; margin-top: 4px;
  }
  .pe-modal-copy:hover { color: #222; }
  .pe-modal-context-title { font-size: 16px; font-weight: bold; color: #222; margin: 24px 0 12px; }
  .pe-modal-context-card {
    border: 1px solid #ddd; border-radius: 12px; padding: 16px;
  }
  .pe-modal-chip {
    display: inline-block; background: #f0f0f0; border-radius: 4px;
    padding: 2px 10px; font-size: 12px; color: #4b4b4b; margin-bottom: 12px;
  }
  .pe-modal-context-desc { font-size: 14px; line-height: 1.6; color: #4b4b4b; margin: 0; }
  .pe-modal-paging {
    display: flex; justify-content: center; align-items: center; gap: 12px;
    margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee;
  }
  .pe-modal-paging-btn {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border: none; border-radius: 6px;
    background: none; cursor: pointer; color: #666; padding: 0;
  }
  .pe-modal-paging-btn:hover:not(:disabled) { background: #f0f0f0; }
  .pe-modal-paging-btn:disabled { opacity: 0.3; cursor: default; }
  .pe-modal-paging-btn::after {
    content: ""; display: block; width: 16px; height: 16px;
    background-color: currentcolor;
    mask-image: url('/img/icons/s2-icon-chevronup-20-n.svg');
    mask-size: contain; mask-repeat: no-repeat; mask-position: center;
  }
  .pe-modal-paging-prev::after { transform: rotate(-90deg); }
  .pe-modal-paging-next::after { transform: rotate(90deg); }
  .pe-modal-paging-label { font-size: 13px; font-weight: bold; color: #444; }
`;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function buildContextCard(context) {
  if (!context) return null;
  const card = el('div', 'pe-modal-context-card');
  if (context.category) card.append(el('span', 'pe-modal-chip', context.category));
  if (context.description) card.append(el('p', 'pe-modal-context-desc', context.description));
  return card;
}

function buildSuggestionBody(item) {
  const frag = document.createDocumentFragment();
  const { suggestion } = item;
  if (!suggestion) return frag;

  if (suggestion.label) frag.append(el('h3', 'pe-modal-asset-label', suggestion.label));

  const issueSection = el('div', 'pe-modal-section');
  const issueHeading = el('div', 'pe-modal-heading');
  const issueIcon = el('span', 'pe-modal-heading-icon issue');
  issueHeading.append(issueIcon, el('span', 'pe-modal-heading-text', 'Issue identified'));
  issueSection.append(issueHeading);
  if (suggestion.issue) issueSection.append(el('p', 'pe-modal-body', suggestion.issue));
  frag.append(issueSection);

  const fixSection = el('div', 'pe-modal-section');
  const fixHeading = el('div', 'pe-modal-heading');
  const fixIcon = el('span', 'pe-modal-heading-icon fix');
  fixHeading.append(fixIcon, el('span', 'pe-modal-heading-text', 'Suggested change'));
  fixSection.append(fixHeading);
  if (suggestion.suggested) fixSection.append(el('p', 'pe-modal-body', suggestion.suggested));

  const copyBtn = el('button', 'pe-modal-copy', '📋 Copy suggestion');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(suggestion.suggested ?? '');
  });
  fixSection.append(copyBtn);
  frag.append(fixSection);

  if (suggestion.context) {
    frag.append(el('div', 'pe-modal-context-title', 'Context'));
    const card = buildContextCard(suggestion.context);
    if (card) frag.append(card);
  }

  return frag;
}

function buildCheckBody(item) {
  const frag = document.createDocumentFragment();
  const { check } = item;
  if (!check) return frag;

  if (check.label) frag.append(el('h3', 'pe-modal-asset-label', check.label));

  if (item.description) {
    const section = el('div', 'pe-modal-section');
    section.append(el('p', 'pe-modal-body', item.description));
    frag.append(section);
  }

  if (check.context) {
    frag.append(el('div', 'pe-modal-context-title', 'Context'));
    const card = buildContextCard(check.context);
    if (card) frag.append(card);
  }

  return frag;
}

function openModal({ componentTitle, items, startIndex, sectionLabel, buildBody }) {
  import('../../shared/dialog/dialog.js').then(() => {
    const navigable = items;
    const total = navigable.length;
    if (!total) return;

    let current = Math.min(startIndex, total - 1);
    const dialog = document.createElement('nx-dialog');
    dialog.title = componentTitle || 'Page evaluation';
    dialog.style.setProperty('--nx-dialog-max-width', '600px');

    const styleEl = document.createElement('style');
    styleEl.textContent = MODAL_STYLES;

    const contentWrap = el('div', 'pe-modal-content');
    const bodyWrap = el('div', 'pe-modal-body-wrap');

    const pagingLabel = el('span', 'pe-modal-paging-label');
    const prevBtn = el('button', 'pe-modal-paging-btn pe-modal-paging-prev');
    const nextBtn = el('button', 'pe-modal-paging-btn pe-modal-paging-next');

    function render() {
      bodyWrap.replaceChildren(buildBody(navigable[current]));
      pagingLabel.textContent = `${current + 1} of ${total} ${sectionLabel}`;
      prevBtn.disabled = current === 0;
      nextBtn.disabled = current >= total - 1;
    }

    prevBtn.addEventListener('click', () => {
      if (current > 0) {
        current -= 1;
        render();
      }
    });
    nextBtn.addEventListener('click', () => {
      if (current < total - 1) {
        current += 1;
        render();
      }
    });

    const pagingRow = el('div', 'pe-modal-paging');
    pagingRow.append(prevBtn, pagingLabel, nextBtn);

    contentWrap.append(bodyWrap, pagingRow);
    dialog.append(styleEl, contentWrap);
    dialog.addEventListener('close', () => dialog.remove());
    render();
    document.body.append(dialog);
  });
}

function openSuggestionModal(componentTitle, items, startIndex, sectionLabel) {
  const suggestItems = items.filter((it) => it.suggestion);
  const idx = suggestItems.indexOf(items[startIndex]);
  openModal({
    componentTitle,
    items: suggestItems,
    startIndex: idx >= 0 ? idx : 0,
    sectionLabel,
    buildBody: buildSuggestionBody,
  });
}

function openCheckModal(componentTitle, items, startIndex, sectionLabel) {
  const checkItems = items.filter((it) => it.check);
  const idx = checkItems.indexOf(items[startIndex]);
  openModal({
    componentTitle,
    items: checkItems,
    startIndex: idx >= 0 ? idx : 0,
    sectionLabel,
    buildBody: buildCheckBody,
  });
}

/* ---- item rows ---- */

function renderItem(item, tone, hidden, onAction) {
  return html`
    <div class="ui-artifact-pe-item" ?hidden=${hidden}>
      ${toneIcon(tone)}
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

/* ---- section ---- */

function sectionLabelFromTone(tone) {
  if (tone === 'negative') return 'failures';
  if (tone === 'positive') return 'passes';
  return 'checks';
}

function renderItems(items, tone, componentTitle) {
  const total = items.length;
  const label = sectionLabelFromTone(tone);

  return html`
    <div class="ui-artifact-pe-items" data-page="0">
      ${items.map((item, i) => renderItem(
    item,
    tone,
    i >= PAGE_SIZE,
    () => {
      if (item.suggestion) openSuggestionModal(componentTitle, items, i, label);
      else if (item.check) openCheckModal(componentTitle, items, i, label);
    },
  ))}
      ${total > PAGE_SIZE ? renderPaging(total) : nothing}
    </div>
  `;
}

function renderSection(section, componentTitle) {
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
      ${items.length ? renderItems(items, tone, componentTitle) : nothing}
    </details>
  `;
}

/* ---- registration ---- */

registerArtifact('PageEvaluationWithIcons', ({
  title = '', summary = [], sections = [],
}) => {
  const root = html`
    <div class="ui-artifact-pe">
      ${summary.length ? renderSummary(summary) : nothing}
      ${sections.map((s) => renderSection(s, title))}
    </div>
  `;

  if (!styleAdopted) {
    queueMicrotask(() => {
      const peEl = document.querySelector('nx-chat-ao')?.shadowRoot?.querySelector('.ui-artifact-pe');
      if (peEl) adoptStyle(peEl);
    });
  }

  return root;
});

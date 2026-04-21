import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import '../../shared/popover/popover.js';
import '../../shared/picker/picker.js';
import { loadHrefSvg } from '../../../utils/svg.js';
import {
  EDITOR_TEXT_FORMAT_ITEMS,
  applyHeadingLevel,
  applyCodeBlock,
  applyParagraph,
  getBlockTypePickerValue,
  isStructureActive,
  toggleStructure,
  markIsActiveInSelection,
  toggleMarkOnSelection,
  selectionHasLink,
  getLinkInfoInSelection,
  applyLink,
  removeLink,
} from './commands.js';

const styles = await loadStyle(import.meta.url);

const ICONS_BASE = new URL('../../img/icons/', import.meta.url).href;

const STRUCTURE_IDS = new Set(['blockquote', 'bullet-list', 'numbered-list']);

const STRUCTURE_ITEMS = EDITOR_TEXT_FORMAT_ITEMS.filter(
  (item) => STRUCTURE_IDS.has(item.id),
);

const BLOCK_TYPE_LABELS = new Map([
  ['paragraph', 'Paragraph'],
  ['heading-1', 'Heading 1'],
  ['heading-2', 'Heading 2'],
  ['heading-3', 'Heading 3'],
  ['code_block', 'Code block'],
]);

const BLOCK_TYPE_PICKER_ITEMS = [
  { section: 'Change into' },
  ...Array.from(BLOCK_TYPE_LABELS, ([value, label]) => ({ value, label })),
];

const BLOCK_TYPE_COMMANDS = {
  paragraph: applyParagraph,
  'heading-1': (s, d) => applyHeadingLevel(s, d, 1),
  'heading-2': (s, d) => applyHeadingLevel(s, d, 2),
  'heading-3': (s, d) => applyHeadingLevel(s, d, 3),
  code_block: applyCodeBlock,
};

const MARK_ACTIONS = [
  { mark: 'strong', label: 'Bold', text: 'B' },
  { mark: 'em', label: 'Italic', text: 'I' },
  { mark: 'code', label: 'Inline code', text: '</>' },
];

function blockTypeLabelForRaw(raw) {
  if (raw === 'mixed') return 'Mixed';
  return BLOCK_TYPE_LABELS.get(raw)
    ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function loadSvgIcon(name) {
  return loadHrefSvg(`${ICONS_BASE}S2_Icon_${name}_20_N.svg`);
}

class NxSelectionToolbar extends LitElement {
  static properties = {
    view: { attribute: false },
    _icons: { state: true },
    _linkDialogOpen: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._loadIcons();
  }

  get _popover() { return this.shadowRoot?.querySelector('nx-popover'); }

  get _picker() { return this.shadowRoot?.querySelector('nx-picker'); }

  show({ x, y }) {
    this._popover?.show({ x, y, placement: 'above' });
    this.requestUpdate();
  }

  hide() {
    this._popover?.close();
  }

  get open() {
    return this._popover?.open ?? false;
  }

  async _loadIcons() {
    const names = STRUCTURE_ITEMS.map((i) => i.icon);
    names.push('Link', 'Unlink');
    const svgs = await Promise.all(names.map(loadSvgIcon));
    this._icons = Object.fromEntries(names.map((n, i) => [n, svgs[i]]));
  }

  _icon(name) {
    const svg = this._icons?.[name];
    return svg ? html`${svg.cloneNode(true)}` : nothing;
  }

  /* ---- Block-type picker ---- */

  _syncBlockTypePicker() {
    const picker = this._picker;
    if (!picker || !this.view) return;
    const raw = getBlockTypePickerValue(this.view.state);
    if (BLOCK_TYPE_LABELS.has(raw)) {
      picker.value = raw;
      picker.labelOverride = '';
    } else {
      picker.value = '';
      picker.labelOverride = blockTypeLabelForRaw(raw);
    }
  }

  _onBlockTypeChange(e) {
    if (!this.view) return;
    const cmd = BLOCK_TYPE_COMMANDS[e.detail.value];
    if (cmd) {
      cmd(this.view.state, this.view.dispatch.bind(this.view));
      this.requestUpdate();
      this.view.focus();
    }
  }

  /* ---- Mark / structure buttons ---- */

  _onToolbarClick(e) {
    e.preventDefault();
    if (!this.view) return;
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (!btn || btn.disabled) return;

    const { mark, handler, link } = btn.dataset;
    if (link === 'create' || link === 'edit') {
      this._showLinkDialog();
      return;
    }
    if (link === 'remove') {
      removeLink(this.view);
      this.requestUpdate();
      this.view.focus();
      return;
    }
    if (mark) toggleMarkOnSelection(this.view, mark);
    else if (handler) toggleStructure(handler, this.view);

    this.requestUpdate();
    this.view.focus();
  }

  _isMarkActive(markName) {
    if (!this.view) return false;
    const mark = this.view.state.schema.marks[markName];
    return mark ? markIsActiveInSelection(this.view.state, mark) : false;
  }

  _isStructureActive(id) {
    if (!this.view) return false;
    return isStructureActive(id, this.view.state);
  }

  _hasLink() {
    if (!this.view) return false;
    return selectionHasLink(this.view.state);
  }

  /* ---- Link dialog ---- */

  _showLinkDialog() {
    if (!this.view) return;
    this.hide();
    this._linkDialogOpen = true;
  }

  _closeLinkDialog() {
    this._linkDialogOpen = false;
    this.view?.focus();
  }

  _onLinkDialogSubmit(e) {
    e.preventDefault();
    if (!this.view) return;
    const form = e.target;
    const href = form.elements['link-href'].value.trim();
    if (!href) return;
    const text = form.elements['link-text'].value;
    this._closeLinkDialog();
    applyLink(this.view, { href, text });
    this.view.focus();
  }

  _onLinkBackdropMousedown(e) {
    if (e.target === e.currentTarget) this._closeLinkDialog();
  }

  _onLinkBackdropKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this._closeLinkDialog();
    }
  }

  get linkDialogOpen() { return this._linkDialogOpen ?? false; }

  /* ---- Rendering ---- */

  updated() {
    this._syncBlockTypePicker();
  }

  _renderMarkButton({ mark, label, text }) {
    const pressed = this._isMarkActive(mark);
    return html`
      <button
        type="button"
        class="toolbar-btn"
        aria-label=${label}
        title=${label}
        aria-pressed=${pressed ? 'true' : 'false'}
        data-mark=${mark}
      >${text}</button>
    `;
  }

  _renderStructureButton({ id, label, icon }) {
    const pressed = this._isStructureActive(id);
    return html`
      <button
        type="button"
        class="toolbar-btn"
        aria-label=${label}
        title=${label}
        aria-pressed=${pressed ? 'true' : 'false'}
        data-handler=${id}
      >${this._icon(icon)}</button>
    `;
  }

  _renderLinkButtons() {
    const hasLink = this._hasLink();
    return html`
      <button type="button" class="toolbar-btn" aria-label="Create link" title="Create link"
        data-link="create" ?hidden=${hasLink}>${this._icon('Link')}</button>
      <button type="button" class="toolbar-btn" aria-label="Edit link" title="Edit link"
        data-link="edit" ?hidden=${!hasLink}>${this._icon('Link')}</button>
      <button type="button" class="toolbar-btn" aria-label="Remove link" title="Remove link"
        data-link="remove" ?hidden=${!hasLink}>${this._icon('Unlink')}</button>
    `;
  }

  _renderLinkDialog() {
    if (!this._linkDialogOpen) return nothing;
    const info = this.view ? getLinkInfoInSelection(this.view.state) : null;

    let hrefVal = '';
    let textVal = '';
    if (info) {
      hrefVal = info.href;
      textVal = info.text;
    } else if (this.view) {
      const { from, to } = this.view.state.selection;
      textVal = from !== to ? this.view.state.doc.textBetween(from, to) : '';
    }

    return html`
      <div class="link-dialog"
        @mousedown=${this._onLinkBackdropMousedown}
        @keydown=${this._onLinkBackdropKeydown}>
        <form class="link-form" @submit=${this._onLinkDialogSubmit}>
          <label class="link-form-field">
            <span>URL</span>
            <input name="link-href" type="url" placeholder="https://…"
                   required autocomplete="off" .value=${hrefVal} />
          </label>
          <label class="link-form-field">
            <span>Display text</span>
            <input name="link-text" type="text" placeholder="Link text"
                   autocomplete="off" .value=${textVal} />
          </label>
          <div class="link-form-actions">
            <button type="button" class="link-form-cancel"
              @click=${() => this._closeLinkDialog()}>Cancel</button>
            <button type="submit" class="link-form-save">Save</button>
          </div>
        </form>
      </div>
    `;
  }

  render() {
    const disabled = !this.view;
    return html`
      <nx-popover placement="above">
        <div class="toolbar-actions" ?data-disabled=${disabled}
          @mousedown=${(e) => { e.preventDefault(); e.stopPropagation(); }}
          @click=${(e) => this._onToolbarClick(e)}>
          <span class="toolbar-block-type-wrap">
            <nx-picker
              class="toolbar-block-type"
              placement="below"
              ignoreFocus
              .items=${BLOCK_TYPE_PICKER_ITEMS}
              value="paragraph"
              @change=${(e) => this._onBlockTypeChange(e)}
            ></nx-picker>
          </span>
          <span class="toolbar-sep" aria-hidden="true"></span>
          ${MARK_ACTIONS.map((m) => this._renderMarkButton(m))}
          <span class="toolbar-sep" aria-hidden="true"></span>
          ${STRUCTURE_ITEMS.map((s) => this._renderStructureButton(s))}
          <span class="toolbar-sep" aria-hidden="true"></span>
          ${this._renderLinkButtons()}
        </div>
      </nx-popover>
      ${this._renderLinkDialog()}
    `;
  }
}

customElements.define('nx-selection-toolbar', NxSelectionToolbar);

export default NxSelectionToolbar;

import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import { getConfig } from '../../../../nx2/scripts/nx.js';
import { loadHrefSvg } from '../../../../nx2/utils/svg.js';
import defaults from './defaults.js';
import { icon } from '../icons.js';
import {
  SCHEMA_SPEC,
  parseRichText,
  serializeRichText,
  getActiveMarks,
  getListType,
  getLinkAt,
  getLinkDraft,
  applyLink,
  removeLink,
  safeHref,
  toggleList,
  BLOCK_TYPES,
  getBlockType,
  setBlock,
  isInBlockquote,
  toggleBlockquote,
  buildKeymap,
} from './richtext-utils.js';

const style = await loadStyle(import.meta.url);

const BAR_GROUPS = [
  [
    { id: 'strong', label: 'Bold', keys: 'Mod+B', icon: 'tagbold', text: 'B' },
    { id: 'em', label: 'Italic', keys: 'Mod+I', icon: 'tagitalic', text: 'I' },
    { id: 'u', label: 'Underline', keys: 'Mod+U', icon: 'tagunderline', text: 'U' },
    { id: 's', label: 'Strikethrough', keys: 'Mod+Shift+X', icon: 'tagstrikethrough', text: 'S' },
  ],
  [
    { id: 'link', label: 'Link', keys: 'Mod+K', icon: 'link', text: 'Link' },
    { id: 'unlink', label: 'Remove link', keys: 'Mod+Shift+K', icon: 'unlink', text: 'Unlink' },
    { id: 'code', label: 'Inline code', keys: 'Mod+E', icon: 'code', text: '</>' },
  ],
];

const MENU_GROUPS = [
  [
    { id: 'ordered_list', label: 'Numbered list', keys: 'Mod+Shift+7', icon: 'listnumbered', text: '1.' },
    { id: 'bullet_list', label: 'Bulleted list', keys: 'Mod+Shift+8', icon: 'listbulleted', text: '•' },
  ],
  [
    { id: 'blockquote', label: 'Blockquote', keys: 'Mod+Shift+9', icon: 'blockquote', text: '❝' },
  ],
  [
    { id: 'sup', label: 'Superscript', keys: 'Mod+.', icon: 'textsuperscript', text: 'x²' },
    { id: 'sub', label: 'Subscript', keys: 'Mod+,', icon: 'textsubscript', text: 'x₂' },
  ],
];

const BAR_TOOLS = BAR_GROUPS.flat();

const TOOLS = [...BAR_TOOLS, ...MENU_GROUPS.flat()];

const MORE = { id: 'more', label: 'More formatting', icon: 'more', text: '⋮' };

const LISTS = new Set(['bullet_list', 'ordered_list']);

const ACTIONS = new Set(['unlink']);

const BLOCK_ITEMS = [{ section: 'Change into' }, ...BLOCK_TYPES];

const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

const loadProseMirror = (() => {
  let promise;
  return () => {
    promise ??= import('da-y-wrapper');
    return promise;
  };
})();

const loadPicker = (() => {
  let promise;
  return () => {
    promise ??= import('../../../../nx2/blocks/shared/picker/picker.js');
    return promise;
  };
})();

const loadPopover = (() => {
  let promise;
  return () => {
    promise ??= import('../../../../nx2/blocks/shared/popover/popover.js');
    return promise;
  };
})();

const loadLinkDialog = (() => {
  let promise;
  return () => {
    promise ??= import('../../../../nx2/blocks/shared/link-dialog/link-dialog.js');
    return promise;
  };
})();

const validateHref = (href) => (safeHref(href) ? '' : 'Use a relative, http(s), mailto or tel link.');

const loadToolIcons = (() => {
  let promise;
  return () => {
    promise ??= (async () => {
      const { codeBase } = getConfig();
      const tools = [...TOOLS, MORE];
      const hrefFor = (tool) => `${codeBase}/img/icons/s2-icon-${tool.icon}-20-n.svg`;
      const svgs = await Promise.all(tools.map((tool) => loadHrefSvg(hrefFor(tool))));
      const entries = tools.map((tool, i) => [tool.id, svgs[i]]);
      return Object.fromEntries(entries.filter(([, svg]) => svg));
    })();
    return promise;
  };
})();

class FormRichtext extends LitElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    description: { type: String },
    error: { type: String },
    placeholder: { type: String },
    name: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },
    _status: { state: true },
    _active: { state: true },
    _focused: { state: true },
    _icons: { state: true },
    _link: { state: true },
    _overflowAt: { state: true },
    _menuOpen: { state: true },
  };

  static loadProseMirror = loadProseMirror;

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, style];
    if (this.hasUpdated) {
      this._initEditor();
      this._observeToolbar();
    }
  }

  disconnectedCallback() {
    this._view?.destroy();
    this._view = undefined;
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    super.disconnectedCallback();
  }

  async firstUpdated() {
    this._observeToolbar();
    loadToolIcons().then((icons) => { this._icons = icons; });
    loadPicker().catch(() => {});
    try {
      this._pm = await this.constructor.loadProseMirror();
      this._schema = new this._pm.Schema(SCHEMA_SPEC);
      this._status = 'ready';
      if (this.isConnected) this._initEditor();
    } catch {
      this._status = 'error';
    }
  }

  updated(changed) {
    const unlinkShown = !this._isToolHidden('unlink');
    if (changed.has('_icons') || unlinkShown !== this._unlinkShown) {
      this._unlinkShown = unlinkShown;
      this._measureToolbar();
    }
    if (this._menuOpen) this._menu?.reposition();
    if (!this._view) return;
    const next = this.value ?? '';
    if (changed.has('value') && next !== this._emitted) {
      this._emitted = next;
      this._view.updateState(this._createState(next));
      this._syncActive();
    }
    if (['disabled', 'error', 'label'].some((key) => changed.has(key))) {
      this._view.setProps({ attributes: this._attributes() });
    }
  }

  focus() {
    this._view?.focus();
  }

  _observeToolbar() {
    const bar = this.shadowRoot.querySelector('.form-richtext-toolbar');
    if (!bar || this._resizeObserver) return;
    this._resizeObserver = new ResizeObserver(() => this._measureToolbar());
    this._resizeObserver.observe(bar, { box: 'border-box' });
    this._resizeObserver.observe(bar.querySelector('.form-richtext-block'));
  }

  // Bar tools that wrap past the single visible line move into the more menu.
  _measureToolbar() {
    const bar = this.shadowRoot.querySelector('.form-richtext-toolbar');
    if (!bar) return;
    const tools = [...bar.querySelectorAll(':scope > [data-tool]')];
    const lineTop = bar.querySelector('.form-richtext-block').offsetTop;
    const at = tools.findIndex((el) => el.offsetTop > lineTop);
    const overflowAt = at === -1 ? BAR_TOOLS.length : at;
    if (overflowAt !== this._overflowAt) this._overflowAt = overflowAt;
  }

  get _menu() {
    return this.shadowRoot.querySelector('.form-richtext-menu');
  }

  async _onMore() {
    if (this._menuOpen) {
      this._menu?.close();
      return;
    }
    try {
      await loadPopover();
    } catch {
      return;
    }
    this._menuOpen = true;
    await this.updateComplete;
    this._menu?.show({ anchor: this.shadowRoot.querySelector('.form-richtext-more'), placement: 'below-end' });
  }

  _onMenuClose(e) {
    e.stopPropagation();
    this._menuOpen = false;
  }

  _attributes() {
    return {
      role: 'textbox',
      'aria-multiline': 'true',
      ...(this.label ? { 'aria-labelledby': 'form-richtext-label' } : { 'aria-label': 'Rich text' }),
      ...(this.error ? { 'aria-invalid': 'true' } : {}),
      ...(this.disabled ? { 'aria-disabled': 'true' } : {}),
      class: 'form-richtext-content',
    };
  }

  _createState(value) {
    const pm = this._pm;
    const schema = this._schema;
    const plugins = [
      ...(pm.history ? [pm.history()] : []),
      pm.keymap(buildKeymap({ pm, schema, onLink: () => this._openLink() })),
      pm.keymap(pm.baseKeymap),
    ];
    return pm.EditorState.create({ doc: parseRichText({ pm, schema, value }), plugins });
  }

  _initEditor() {
    const mount = this.shadowRoot.querySelector('.form-richtext-editor');
    if (!this._pm || !mount || this._view) return;
    this._emitted = this.value ?? '';
    this._view = new this._pm.EditorView(mount, {
      state: this._createState(this._emitted),
      editable: () => !this.disabled,
      attributes: this._attributes(),
      dispatchTransaction: (tr) => this._dispatch(tr),
    });
    this._syncActive();
  }

  _dispatch(tr) {
    const view = this._view;
    view.updateState(view.state.apply(tr));
    this._syncActive();
    if (!tr.docChanged) return;
    const next = serializeRichText(view.state.doc);
    if (next === this._emitted) return;
    this._emitted = next;
    this._dirty = true;
    this.value = next;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }

  _syncActive() {
    const { state } = this._view;
    const { doc } = state;
    this._active = {
      marks: getActiveMarks(state),
      list: getListType(state)?.name,
      block: getBlockType(state),
      quote: isInBlockquote(state),
      link: getLinkAt(state)?.href,
      linked: removeLink(state),
      empty: doc.childCount === 1 && doc.firstChild.type.name === 'paragraph' && doc.firstChild.content.size === 0,
    };
  }

  _run(command) {
    if (!this._view || this.disabled) return;
    command(this._view.state, this._view.dispatch);
    this._view.focus();
  }

  _onTool(id) {
    const pm = this._pm;
    if (id === 'link') {
      this._menu?.close();
      this._openLink();
      return;
    }
    if (id === 'unlink') this._run(removeLink);
    else if (id === 'blockquote') this._run(toggleBlockquote({ pm }));
    else if (LISTS.has(id)) this._run(toggleList({ pm, name: id }));
    else this._run(pm.toggleMark(this._schema.marks[id]));
  }

  _onBlockType(e) {
    e.stopPropagation();
    this._run(setBlock({ pm: this._pm, value: e.detail.value }));
  }

  async _openLink() {
    if (!this._view || this.disabled || this._link) return;
    const draft = getLinkDraft(this._view.state);
    try {
      await loadLinkDialog();
    } catch {
      return;
    }
    this._link = draft;
  }

  _onLinkSubmit(e) {
    e.stopPropagation();
    const { href, text, title } = e.detail;
    applyLink({
      pm: this._pm, href, text, title,
    })(this._view.state, this._view.dispatch);
    this.shadowRoot.querySelector('nx-link-dialog')?.close();
  }

  _onLinkClose(e) {
    e.stopPropagation();
    this._link = undefined;
    this._view?.focus();
  }

  _onFocusIn() {
    this._focused = true;
  }

  _onFocusOut(e) {
    if (e.relatedTarget && this.shadowRoot.contains(e.relatedTarget)) return;
    this._focused = false;
    if (!this._dirty) return;
    this._dirty = false;
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  // The editor keeps a selection while blurred, so the toolbar only reflects it with focus.
  get _selection() {
    return this._focused || this._link ? this._active : undefined;
  }

  _isPressed(id) {
    if (id === 'link' && this._link) return true;
    const active = this._selection;
    if (!active) return false;
    if (id === 'link') return !!active.link;
    if (id === 'blockquote') return active.quote;
    if (LISTS.has(id)) return active.list === id;
    return active.marks.has(id);
  }

  _isToolDisabled(id) {
    if (this.disabled || this._status !== 'ready') return true;
    if (id === 'unlink') return !this._selection?.linked;
    return false;
  }

  _isToolHidden(id) {
    return id === 'unlink' && !this._selection?.linked;
  }

  _renderIcon(tool) {
    const svg = this._icons?.[tool.id];
    return svg ? svg.cloneNode(true) : html`<span class="form-richtext-tool-text">${tool.text}</span>`;
  }

  _renderTool(tool, { overflow } = {}) {
    const title = `${tool.label} (${tool.keys.replace('Mod', MOD)})`;
    const classes = [overflow && 'is-overflow', this._isToolHidden(tool.id) && 'is-hidden'];
    return html`
      <button
        type="button"
        class="form-richtext-tool ${classes.filter(Boolean).join(' ')}"
        data-tool=${tool.id}
        title=${title}
        aria-label=${tool.label}
        aria-pressed=${ACTIONS.has(tool.id) ? nothing : String(this._isPressed(tool.id))}
        ?disabled=${this._isToolDisabled(tool.id)}
        @mousedown=${(e) => e.preventDefault()}
        @click=${() => this._onTool(tool.id)}
      >${this._renderIcon(tool)}</button>
    `;
  }

  _renderBar() {
    const at = this._overflowAt ?? BAR_TOOLS.length;
    return BAR_GROUPS.map((group) => html`
      <span class="form-richtext-sep ${BAR_TOOLS.indexOf(group[0]) >= at ? 'is-overflow' : ''}"></span>
      ${group.map((tool) => this._renderTool(tool, { overflow: BAR_TOOLS.indexOf(tool) >= at }))}
    `);
  }

  _renderMore() {
    const at = this._overflowAt ?? BAR_TOOLS.length;
    const overflowed = BAR_GROUPS
      .map((group) => group.filter((tool) => BAR_TOOLS.indexOf(tool) >= at))
      .filter((group) => group.length);
    const groups = [...overflowed, ...MENU_GROUPS];
    return html`
      <button
        type="button"
        class="form-richtext-tool form-richtext-more"
        title=${MORE.label}
        aria-label=${MORE.label}
        aria-haspopup="true"
        aria-expanded=${String(!!this._menuOpen)}
        ?disabled=${this.disabled || this._status !== 'ready'}
        @mousedown=${(e) => e.preventDefault()}
        @click=${this._onMore}
      >${this._renderIcon(MORE)}</button>
      <nx-popover class="form-richtext-menu" @close=${this._onMenuClose}>
        ${this._menuOpen ? html`
          <div class="form-richtext-menu-row" role="group" aria-label=${MORE.label}>
            ${groups.map((group, i) => html`
              ${i ? html`<span class="form-richtext-sep"></span>` : nothing}
              ${group.map((tool) => this._renderTool(tool))}
            `)}
          </div>
        ` : nothing}
      </nx-popover>
    `;
  }

  _renderBlockPicker() {
    const unavailable = this.disabled || this._status !== 'ready' || !!this._selection?.list;
    return html`
      <div class="form-richtext-block${unavailable ? ' is-disabled' : ''}"
        title="Text style">
        <nx-picker
          class="form-richtext-block-picker"
          aria-label="Text style"
          ?inert=${unavailable}
          .items=${BLOCK_ITEMS}
          .value=${this._selection?.block ?? 'paragraph'}
          @change=${this._onBlockType}
        ></nx-picker>
      </div>
    `;
  }

  _renderLink() {
    if (!this._link) return nothing;
    return html`
      <nx-link-dialog
        open
        show-title
        .href=${this._link.href}
        .text=${this._link.text}
        .anchorTitle=${this._link.title}
        .validate=${validateHref}
        @nx-link-submit=${this._onLinkSubmit}
        @close=${this._onLinkClose}
      ></nx-link-dialog>
    `;
  }

  render() {
    const showHint = !this.error && this.description;
    const showPlaceholder = this.placeholder && this._active?.empty;
    return html`
      <div class="form-field${this.error ? ' has-error' : ''}" @focusin=${this._onFocusIn} @focusout=${this._onFocusOut}>
        ${this.label ? html`<label id="form-richtext-label" @click=${() => this.focus()}>${this.label}${this.required ? html`<span class="form-required">*</span>` : nothing}</label>` : nothing}
        <div class="form-richtext">
          <div class="form-richtext-toolbar" role="toolbar" aria-label="Formatting">
            ${this._renderBlockPicker()}
            ${this._renderBar()}
            ${this._renderMore()}
          </div>
          ${this._renderLink()}
          <div class="form-input-wrap">
            <div class="form-richtext-editor" aria-busy=${this._status ? 'false' : 'true'}></div>
            ${showPlaceholder ? html`<span class="form-richtext-placeholder" aria-hidden="true">${this.placeholder}</span>` : nothing}
            ${this.error ? icon('alert', 'form-field-icon') : nothing}
          </div>
        </div>
        ${this._status === 'error' ? html`<p class="form-field-error">The rich text editor could not be loaded.</p>` : nothing}
        ${this.error ? html`<p class="form-field-error">${this.error}</p>` : nothing}
        ${showHint ? html`<p class="form-field-description">${this.description}</p>` : nothing}
      </div>
    `;
  }
}

if (!customElements.get('form-richtext')) customElements.define('form-richtext', FormRichtext);

export default FormRichtext;

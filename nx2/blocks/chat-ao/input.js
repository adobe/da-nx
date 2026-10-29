import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { getConfig } from '../../scripts/nx.js';
import { createFileDropHandlers } from '../shared/chat/dnd.js';
import { openPopoverAbove } from '../shared/chat/positioning.js';
import { buildAttachmentItems } from '../shared/chat/files.js';
import { createSlashMenu } from '../shared/chat/slash-menu.js';
import { createVoiceInput, isVoiceInputSupported, appendTranscript } from './utils/voice-input.js';
import { showToast } from '../shared/toast/toast.js';
import { AO_UPLOAD_EXTENSIONS, AO_MAX_FILE_SIZE_BYTES, ADD_MENU_ITEMS } from './ao-constants.js';
import { CHAT_WORKING_MESSAGE, ICON_NAMES, MENU_OPTIONS } from '../shared/chat/constants.js';
import { sampleRUM } from '../../deps/rum.js';
import '../shared/pills/pills.js';
import '../shared/menu/menu.js';
import '../shared/popover/popover.js';
import '../shared/chat/prompts/prompts.js';

const [inputTokens, styles, buttonStyle] = await Promise.all([
  loadStyle(new URL('../shared/chat/input.css', import.meta.url).href),
  loadStyle(import.meta.url),
  loadStyle(new URL('../../styles/buttons.css', import.meta.url).href),
]);
const { codeBase } = getConfig();
const icon = (name) => html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${ICON_NAMES[name]}.svg#icon"></use></svg>`;
const isAllowedFile = (file) => AO_UPLOAD_EXTENSIONS
  .some((ext) => (file.name?.toLowerCase() ?? '').endsWith(ext));

export default class NxAoInput extends LitElement {
  static properties = {
    blocked: { type: Boolean },
    disabled: { type: Boolean },
    showInputStatus: { type: Boolean, reflect: true },
    statusMessage: { type: String },
    placeholder: { type: String },
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true },
    altHarness: { type: Boolean },
    prompts: { type: Array },
    menuItems: { type: Array },
    addEvent: { type: String },
    getSkills: { attribute: false },
    onSubmit: { attribute: false },
    onStop: { attribute: false },
    onInput: { attribute: false },
    onMenuSelect: { attribute: false },
    _dragging: { state: true },
    _voiceListening: { state: true },
    _submitting: { state: true },
    _readingFiles: { state: true },
  };

  _slashMenu = createSlashMenu(this, { getItems: (filter) => this._getSlashItems(filter) });

  _voiceInterim = '';

  get draft() {
    return this.shadowRoot.querySelector('.chat-input')?.value ?? '';
  }

  get items() {
    return this.shadowRoot.querySelector('nx-pills')?.items ?? [];
  }

  get _disabled() {
    return this.blocked || this.disabled || this._submitting || this._readingFiles;
  }

  addItem(item) {
    this.shadowRoot.querySelector('nx-pills')?.add(item);
  }

  async focusInput() {
    await this.updateComplete;
    this.shadowRoot.querySelector('.chat-input')?.focus();
  }

  async setPrompt(text, { autoSend = false, replace = true } = {}) {
    await this.updateComplete;
    if (!text || this._disabled) return false;
    if (!replace && this.draft.trim() && this.draft !== text) return false;
    this.shadowRoot.querySelector('.prompts-popover')?.close();
    this.shadowRoot.querySelector('.chat-input').value = text;
    if (autoSend) return this._submit();
    await this.focusInput();
    return true;
  }

  openPrompts() {
    openPopoverAbove(
      this.shadowRoot.querySelector('.prompts-popover'),
      this.shadowRoot.querySelector('.chat-form'),
      { onOpen: () => this.shadowRoot.querySelector('nx-prompts')?.focus() },
    );
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEvent ??= `nx-ao-input-${crypto.randomUUID()}`;
    this.shadowRoot.adoptedStyleSheets = [inputTokens, styles, buttonStyle];
    this._dnd = createFileDropHandlers({
      isAllowed: isAllowedFile,
      onDragging: (dragging) => { this._dragging = dragging && !this._disabled; },
      onFiles: (files) => this._onFilesSelected(files),
    });
    this._voice = createVoiceInput({
      onStart: () => { this._voiceListening = true; },
      onEnd: () => { this._voiceListening = false; this._voiceInterim = ''; },
      onInterimText: (text) => this._handleVoiceText(text, true),
      onFinalText: (text) => {
        this._handleVoiceText(text, false);
        this.focusInput();
      },
      onError: (message) => showToast({ text: message, variant: 'error' }),
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._voice?.stop();
    this._slashMenu.close();
  }

  _toggleVoiceInput() {
    if (this._voiceListening) this._voice.stop();
    else this._voice.start();
  }

  _handleVoiceText(text, isInterim) {
    const input = this.shadowRoot.querySelector('.chat-input');
    if (!input) return;
    const { value, interim } = appendTranscript(input.value, this._voiceInterim, text, isInterim);
    input.value = value;
    this._voiceInterim = interim;
  }

  _onAddClick(e) {
    const popover = this.shadowRoot.querySelector('.prompts-popover');
    if (!popover?.open) return;
    e.stopImmediatePropagation();
    popover.close();
  }

  _getSlashItems(filter) {
    const skills = (this.getSkills?.() ?? []).map((id) => ({ id, label: id }));
    const filtered = filter
      ? skills.filter((item) => item.id.toLowerCase().includes(filter))
      : skills;
    return filtered.length ? [{ section: 'Skills' }, ...filtered] : [];
  }

  _onSlashSelect(skillId) {
    const { message } = this._slashMenu.resolveSelection(skillId);
    this._send(message);
  }

  _send(text) {
    if (this._disabled || !this.onSubmit) return false;
    const context = this.items.filter((item) => !item.dataBase64);
    const attachments = this.items.filter((item) => item.dataBase64);
    const { draft } = this;
    const finish = (accepted) => {
      this._submitting = false;
      if (accepted === false) return false;
      if (this.isConnected && this.draft === draft) {
        this.shadowRoot.querySelector('.chat-input').value = '';
        this.shadowRoot.querySelector('nx-pills')?.clear();
      }
      return true;
    };
    const fail = (error) => {
      this._submitting = false;
      showToast({ text: error.message, variant: 'error' });
      return false;
    };
    this._submitting = true;
    try {
      const accepted = this.onSubmit({ text, context, attachments });
      return accepted?.then ? accepted.then(finish, fail) : finish(accepted);
    } catch (error) {
      return fail(error);
    }
  }

  _submit(e) {
    e?.preventDefault();
    if (this.blocked) {
      this.onStop?.();
      return false;
    }
    if (this._disabled) return false;
    const count = this.items.filter((item) => item.dataBase64).length;
    const text = this.draft.trim() || (count ? `Attached file${count > 1 ? 's' : ''}` : '');
    if (!text) return false;
    const harness = this.altHarness ? 'cma' : 'coworker';
    sampleRUM('click', { source: 'chat-submit', target: `button.chat-send.harness-${harness}` });
    this._slashMenu.close();
    return this._send(text);
  }

  _handleInput(e) {
    this._slashMenu.onInput(e);
    this.onInput?.();
  }

  _onItemsChange() {
    this.requestUpdate();
  }

  _handleKeydown(e) {
    if (this._disabled || e.isComposing) return;
    if (this._slashMenu.onKeydown(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._submit();
    }
  }

  _handleMenuSelect({ detail: { id } }) {
    this.openAddAction(id);
  }

  openAddAction(id) {
    if (this._disabled) return;
    if (id === MENU_OPTIONS.FILES) this.shadowRoot.querySelector('.chat-file-input')?.click();
    else if (id === MENU_OPTIONS.PROMPT) this.openPrompts();
    else if (id === MENU_OPTIONS.COMMAND) this._slashMenu.insertSlash();
    else this.onMenuSelect?.(id);
  }

  async _onFilesSelected(fileList) {
    if (this._disabled) return;
    this._readingFiles = true;
    try {
      const items = await buildAttachmentItems(fileList, {
        currentCount: this.items.filter((item) => item.dataBase64).length,
        maxFileSize: AO_MAX_FILE_SIZE_BYTES,
      });
      if (this.isConnected) items.forEach((item) => this.addItem(item));
      else items.forEach((item) => { if (item.thumbnail) URL.revokeObjectURL(item.thumbnail); });
    } finally {
      this._readingFiles = false;
    }
  }

  async _onFileInputChange(e) {
    const { target } = e;
    await this._onFilesSelected(target.files);
    target.value = '';
  }

  render() {
    const working = this.showInputStatus && this.blocked;
    const pendingStatus = this._readingFiles ? 'Reading files...' : this.statusMessage;
    const status = working ? CHAT_WORKING_MESSAGE : pendingStatus;
    const compactSize = this.size === 'm' ? '' : 'nx-btn-sm';
    const expandedSize = this.size === 'm' ? 'nx-btn-lg' : '';
    const buttonSize = this.variant === 'expanded' ? expandedSize : compactSize;
    return html`
      <nx-popover class="prompts-popover">
        <nx-prompts .prompts=${this.prompts ?? []} .onSend=${(p) => this.setPrompt(p)}></nx-prompts>
      </nx-popover>
      <nx-menu
        class="slash-menu"
        size="m"
        .ignoreFocus=${true}
        .scoped=${true}
        @select=${({ detail }) => this._onSlashSelect(detail.id)}
        @mousedown=${(e) => e.preventDefault()}
      ></nx-menu>
      <form class="chat-form ${working ? 'is-processing' : ''}" aria-busy=${!!(this.blocked || this._submitting || this._readingFiles || this.statusMessage)}
        @submit=${this._submit}
        @dragenter=${this._dnd.onDragEnter}
        @dragleave=${this._dnd.onDragLeave}
        @dragover=${this._dnd.onDragOver}
        @drop=${this._dnd.onDrop}
      >
        ${this._dragging && !this._disabled ? html`
          <div class="chat-drop-zone" aria-hidden="true">
            <span class="chat-drop-title">Drop a file to add context</span>
            <span class="chat-drop-hint">Supports documents, images, and code</span>
          </div>` : nothing}
        <nx-pills addEvent=${this.addEvent ?? ''} ?hidden=${!this.items.length}
          @nx-pills-change=${this._onItemsChange}></nx-pills>
        <input
          class="chat-file-input"
          type="file"
          accept=${AO_UPLOAD_EXTENSIONS.join(',')}
          multiple
          hidden
          @change=${this._onFileInputChange}
        />
        <div class="chat-input-wrap ${this.altHarness ? '' : 'coworker-chat'}">
          ${status ? html`<div class="chat-working" role="status">
            <span class="nx-loading-spinner" aria-hidden="true"></span>${status}
          </div>` : nothing}
          <textarea
            class="chat-input"
            rows="1"
            aria-label="Message"
            placeholder=${this.placeholder ?? 'Ask anything, or type / for skills...'}
            ?disabled=${this._disabled}
            ?hidden=${!!status}
            @input=${this._handleInput}
            @keydown=${this._handleKeydown}
            @blur=${this._slashMenu.onBlur}
          ></textarea>
        </div>
        <div class="chat-actions" ?data-thinking=${this.blocked}
          ?data-has-items=${!!this.items.length} ?data-voice-listening=${this._voiceListening}>
          <nx-menu size="m" .items=${this.menuItems ?? ADD_MENU_ITEMS} placement="above" @select=${this._handleMenuSelect}>
            <button slot="trigger" class="chat-add nx-action-btn-icon ${buttonSize}" type="button" aria-label="Add" ?disabled=${this._disabled} @click=${this._onAddClick}>
              <span class="icon-add">${icon('add')}</span>
              <span class="icon-up">${icon('up')}</span>
            </button>
          </nx-menu>
          <div class="chat-primary-action">
            ${isVoiceInputSupported() ? html`
              <button
                type="button"
                class="chat-voice nx-action-btn-icon ${buttonSize}"
                ?data-listening=${this._voiceListening}
                ?disabled=${this._disabled}
                aria-pressed=${this._voiceListening}
                aria-label=${this._voiceListening ? 'Stop recording' : 'Use voice input'}
                @click=${this._toggleVoiceInput}
              >${icon('mic')}</button>
            ` : nothing}
            <button
              type="button"
              aria-label="Stop"
              class="chat-stop nx-action-btn-icon is-active ${buttonSize}"
              ?hidden=${!this.blocked}
              @click=${this._submit}
            > ${icon(this.showInputStatus ? 'stopProcessing' : 'stop')}</button>
            <button type="submit" class="chat-send harness-${this.altHarness ? 'cma' : 'coworker'} nx-action-btn-icon is-active ${buttonSize}"
              ?disabled=${this._disabled} ?hidden=${this.blocked} aria-label="Send">
              ${icon('send')}
            </button>
          </div>
        </div>
      </form>
    `;
  }
}

if (!customElements.get('nx-ao-input')) customElements.define('nx-ao-input', NxAoInput);

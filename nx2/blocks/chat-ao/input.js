import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
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
import { CHAT_EVENT } from '../../utils/chat.js';
import { toSlashMenuItems } from './utils/skills.js';
import '../shared/pills/pills.js';
import '../shared/menu/menu.js';
import '../shared/popover/popover.js';
import '../shared/chat/prompts/prompts.js';

const [styles, buttonStyle, spinnerStyle] = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(new URL('../../styles/buttons.css', import.meta.url).href),
  loadStyle(new URL('../../styles/spinner.css', import.meta.url).href),
]);
const { codeBase } = getConfig();
const icon = (name) => html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${ICON_NAMES[name]}.svg#icon"></use></svg>`;
const isAllowedFile = (file) => AO_UPLOAD_EXTENSIONS
  .some((ext) => (file.name?.toLowerCase() ?? '').endsWith(ext));

export default class NxAoInput extends LitElement {
  static properties = {
    blocked: { type: Boolean },
    altHarness: { type: Boolean },
    prompts: { type: Array },
    menuItems: { type: Array },
    placeholder: { type: String },
    addEvent: { type: String },
    getSkills: { attribute: false },
    onSubmit: { attribute: false },
    onStop: { attribute: false },
    onInput: { attribute: false },
    onMenuSelect: { attribute: false },
    _dragging: { state: true },
    _voiceListening: { state: true },
  };

  _slashMenu = createSlashMenu(this, { getItems: (filter) => this._getSlashItems(filter) });

  _voiceInterim = '';

  _contextEvent = `nx-ao-context-${crypto.randomUUID()}`;

  get isolated() { return !!this._isolated; }

  set isolated(value) {
    this._isolated = !!value;
    this._syncSession();
  }

  get _standalone() {
    return !this.onSubmit && !!this._context?.org && !!this._context?.site;
  }

  set context(value) {
    this._explicitContext = true;
    this._context = value;
    this._syncSession();
  }

  set harnessConfig(value) {
    this._harnessConfig = value;
    this._syncSession();
  }

  _syncSession() {
    if (!this.isConnected) return;
    const { org, site } = this._context ?? {};
    const identity = JSON.stringify([
      org, site, !!this.onSubmit, this.isolated, this._harnessConfig,
    ]);
    if (identity === this._sessionIdentity) return;
    this._sessionIdentity = identity;
    this.requestUpdate();
    const request = {};
    this._sessionRequest = request;
    if (this._session) this.blocked = false;
    this._releaseSession?.();
    this._releaseSession = undefined;
    this._session = undefined;
    this._unsubscribeEvents?.();
    this._unsubscribeEvents = undefined;
    if (!this._standalone) return;
    this._sessionReady = this._joinSession({ request, context: this._context });
  }

  async _joinSession({ request, context }) {
    try {
      const { getAoSession, subscribeChatEvents } = await import('./session.js');
      const key = `${context.org}/${context.site}`;
      const supplied = this._harnessConfig;
      const { altHarness, activationKey } = supplied && (!supplied.key || supplied.key === key)
        ? supplied
        : await (await import('../../utils/ewFlags.js')).getCoworkerConfig(context);
      if (!this.isConnected || this._sessionRequest !== request || !this._standalone) return;
      this.altHarness = !!altHarness;
      this._session = getAoSession({
        context, owner: this, isolated: this.isolated, altHarness, activationKey,
      });
      this._releaseSession = this._session.subscribe(this, {
        onUpdate: (state) => { this.blocked = !!state.thinking && !state.pendingPlanApproval; },
      });
      this._unsubscribeEvents = subscribeChatEvents(this, {
        getContext: () => this._context,
        getSession: () => this._session,
        onPrompt: ({ text, autoSend }) => this.setPrompt(text, { autoSend }),
        onContext: (detail) => {
          document.dispatchEvent(new CustomEvent(this._contextEvent, { detail }));
        },
      });
    } catch (error) {
      if (!this.isConnected || this._sessionRequest !== request) return;
      this._sessionIdentity = undefined;
      showToast({ text: error.message, variant: 'error' });
    }
  }

  get draft() {
    return this.shadowRoot.querySelector('.chat-input')?.value ?? '';
  }

  get items() {
    return this.shadowRoot.querySelector('nx-pills')?.items ?? [];
  }

  addItem(item) {
    this.shadowRoot.querySelector('nx-pills')?.add(item);
  }

  async focusInput() {
    await this.updateComplete;
    this.shadowRoot.querySelector('.chat-input')?.focus();
  }

  async setPrompt(text, { autoSend = false } = {}) {
    await this.updateComplete;
    if (!text || this.blocked) return;
    this.shadowRoot.querySelector('.prompts-popover')?.close();
    this.shadowRoot.querySelector('.chat-input').value = text;
    if (autoSend) this.shadowRoot.querySelector('form').requestSubmit();
    else await this.focusInput();
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
    this.shadowRoot.adoptedStyleSheets = [styles, buttonStyle, spinnerStyle];
    this._dnd = createFileDropHandlers({
      isAllowed: isAllowedFile,
      onDragging: (dragging) => { this._dragging = dragging; },
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
    this._unsubscribeHash = hashChange.subscribe((state) => {
      if (this._explicitContext) return;
      this._context = state;
      this._syncSession();
    });
    this._syncSession();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._voice?.stop();
    this._slashMenu.close();
    this._unsubscribeHash?.();
    this._unsubscribeEvents?.();
    this._releaseSession?.();
    this._releaseSession = undefined;
    this._unsubscribeEvents = undefined;
    this._unsubscribeHash = undefined;
    this._session = undefined;
    this._sessionIdentity = undefined;
    this._sessionRequest = undefined;
  }

  updated(changed) {
    if (changed.has('onSubmit')) this._syncSession();
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
    const skills = this._standalone
      ? this._session?.controller.getSkills() : this.getSkills?.();
    return toSlashMenuItems({ skills: skills ?? [], filter });
  }

  _onSlashSelect(skillId) {
    const { message } = this._slashMenu.resolveSelection(skillId);
    this._send(message);
  }

  _send(text) {
    const context = this.items.filter((item) => !item.dataBase64);
    const attachments = this.items.filter((item) => item.dataBase64);
    if (this._standalone) {
      if (!this._session?.send({
        context: this._context, args: [text, context, attachments],
      })) return;
      const { org, site } = this._context;
      this.dispatchEvent(new CustomEvent(CHAT_EVENT.MESSAGE_SENT, {
        bubbles: true, composed: true, detail: { org, site },
      }));
    } else if (this.onSubmit?.({ text, context, attachments }) === false) return;
    this.shadowRoot.querySelector('.chat-input').value = '';
    this.shadowRoot.querySelector('nx-pills')?.clear();
  }

  _submit(e) {
    e?.preventDefault();
    if (this.blocked) return;
    const text = this.draft.trim();
    if (!text) return;
    const harness = this.altHarness ? 'cma' : 'coworker';
    sampleRUM('click', { source: 'chat-submit', target: `button.chat-send.harness-${harness}` });
    this._slashMenu.close();
    this._send(text);
  }

  _handleInput(e) {
    this._slashMenu.onInput(e);
    if (this._standalone) this._session?.controller.warmSession();
    else this.onInput?.();
  }

  _stop() {
    if (this._standalone) this._session?.controller.stop();
    else this.onStop?.();
    this.focusInput();
  }

  _handleKeydown(e) {
    if (this._slashMenu.onKeydown(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._submit();
    }
  }

  _handleMenuSelect({ detail: { id } }) {
    if (id === MENU_OPTIONS.FILES) this.shadowRoot.querySelector('.chat-file-input')?.click();
    else if (id === MENU_OPTIONS.PROMPT) this.openPrompts();
    else if (id === MENU_OPTIONS.COMMAND) this._slashMenu.insertSlash();
    else this.onMenuSelect?.(id);
  }

  async _onFilesSelected(fileList) {
    const items = await buildAttachmentItems(fileList, {
      currentCount: this.items.filter((item) => item.dataBase64).length,
      maxFileSize: AO_MAX_FILE_SIZE_BYTES,
    });
    items.forEach((item) => this.addItem(item));
  }

  async _onFileInputChange(e) {
    const { target } = e;
    await this._onFilesSelected(target.files);
    target.value = '';
  }

  render() {
    // The full chat shows its own progress, so only a standalone input reports it.
    const working = this._standalone && this.blocked;
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
      <form class="chat-form" aria-busy=${working} @submit=${this._submit}
        @dragenter=${this._dnd.onDragEnter}
        @dragleave=${this._dnd.onDragLeave}
        @dragover=${this._dnd.onDragOver}
        @drop=${this._dnd.onDrop}
      >
        ${this._dragging ? html`
          <div class="chat-drop-zone" aria-hidden="true">
            <span class="chat-drop-title">Drop a file to add context</span>
            <span class="chat-drop-hint">Supports documents, images, and code</span>
          </div>` : nothing}
        <nx-pills addEvent=${this._standalone ? this._contextEvent : this.addEvent ?? ''}></nx-pills>
        <input
          class="chat-file-input"
          type="file"
          accept=${AO_UPLOAD_EXTENSIONS.join(',')}
          multiple
          hidden
          @change=${this._onFileInputChange}
        />
        <div class="chat-input-wrap ${this.altHarness ? '' : 'coworker-chat'}">
          ${working ? html`<div class="chat-working" role="status">
            <span class="nx-loading-spinner" aria-hidden="true"></span>${CHAT_WORKING_MESSAGE}
          </div>` : nothing}
          <textarea
            class="chat-input"
            placeholder=${this.placeholder ?? 'Ask anything, or type / for skills...'}
            ?hidden=${working}
            ?disabled=${this.blocked}
            @input=${this._handleInput}
            @keydown=${this._handleKeydown}
            @blur=${this._slashMenu.onBlur}
          ></textarea>
        </div>
        <div class="chat-actions" ?data-thinking=${this.blocked} ?data-voice-listening=${this._voiceListening}>
          <nx-menu size="m" .items=${this.menuItems ?? ADD_MENU_ITEMS} placement="above" @select=${this._handleMenuSelect}>
            <button slot="trigger" class="chat-add nx-action-btn-icon nx-btn-sm" type="button" aria-label="Add" @click=${this._onAddClick}>
              <span class="icon-add">${icon('add')}</span>
              <span class="icon-up">${icon('up')}</span>
            </button>
          </nx-menu>
          <div class="chat-primary-action">
            ${isVoiceInputSupported() ? html`
              <button
                type="button"
                class="chat-voice nx-action-btn-icon nx-btn-sm"
                ?data-listening=${this._voiceListening}
                ?disabled=${this.blocked}
                aria-pressed=${this._voiceListening}
                aria-label=${this._voiceListening ? 'Stop recording' : 'Use voice input'}
                @click=${this._toggleVoiceInput}
              >${icon('mic')}</button>
            ` : nothing}
            <button
              type="button"
              class="chat-stop nx-action-btn-icon is-active nx-btn-sm"
              ?hidden=${!this.blocked}
              aria-label="Stop"
              @click=${this._stop}
            > ${icon(working ? 'stopProcessing' : 'stop')}</button>
            <button type="submit" class="chat-send harness-${this.altHarness ? 'cma' : 'coworker'} nx-action-btn-icon is-active nx-btn-sm" ?hidden=${this.blocked} aria-label="Send">
              ${icon('send')}
            </button>
          </div>
        </div>
      </form>
    `;
  }
}

if (!customElements.get('nx-ao-input')) customElements.define('nx-ao-input', NxAoInput);

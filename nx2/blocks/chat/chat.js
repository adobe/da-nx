import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import { buildAttachmentItems } from '../shared/chat/files.js';
import '../shared/menu/menu.js';
import ChatBackend from './chat-backend.js';
import { renderMessage } from './renderers/renderers.js';
import { renderToolCard } from './renderers/card-renderers.js';
import { renderUiArtifact } from './ao/ao-renderers.js';
import '../shared/chat/new-chat/new-chat.js';
import '../shared/chat/prompts/prompts.js';
import '../shared/pills/pills.js';
import './interaction/interaction.js';
import { loadSiteConfig } from './utils/api.js';
import { isCoworkerEnabled } from '../../utils/ewFlags.js';
import { getConfig } from '../../scripts/nx.js';
import { buildAttachmentPayload } from './utils/chat-helpers.js';
import {
  parseFig, summarizeFigForAgent, extractFigImages, uploadFigImages, buildImagesBlock,
} from './utils/fig-strip.js';
import { PANEL_EVENT } from '../../utils/panel.js';
import { CHAT_EVENT } from '../../utils/chat.js';
import { createFileDropHandlers } from '../shared/chat/dnd.js';
import { openPopoverAbove } from '../shared/chat/positioning.js';
import { createSlashMenu } from '../shared/chat/slash-menu.js';
import { ADD_MENU_ITEMS, ADOBE_AI_GUIDELINES_URL, ICON_NAMES, MENU_OPTIONS } from '../shared/chat/constants.js';
import { ROLE } from './constants.js';

const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

const icon = (name) => html`<svg class="chat-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${ICON_NAMES[name]}.svg#icon"></use></svg>`;

function isAllowedFile(file) {
  return file.type?.startsWith('image/')
    || file.type === 'application/pdf'
    || file.type === 'text/markdown'
    || file.name?.endsWith('.md');
}

class NxChat extends LitElement {
  static properties = {
    messages: { type: Array },
    thinking: { type: Boolean },
    connected: { type: Boolean },
    toolCards: { type: Object },
    // Discriminated union { type: 'approval'|'question'|'plan', ... } | null — see
    // chat-backend.js#_normalize. Populated for both backends, since approval is
    // da-agent's one turn-suspension concept too; question/plan never occur there.
    pendingInteraction: { type: Object },
    // Resolved async from the `ew.coworker` site flag once org/site are known (see
    // _ensureController) — undefined/false until then, which also means MENU_ITEMS
    // renders as the full (da-agent) list during that brief window.
    _useCoworker: { state: true },
    _prompts: { state: true },
    _hasItems: { state: true },
    _dragging: { state: true },
  };

  _slashMenu = createSlashMenu(this, { getItems: (filter) => this._getSlashItems(filter) });

  set context(value) {
    this._explicitContext = true;
    this._applyContext(value);
  }

  setPrompt(text, { autoSend = false } = {}) {
    if (this.connected) {
      this._sendPrompt(text, { autoSend });
    } else {
      this._pendingPrompt = { text, autoSend };
    }
  }

  addAttachment(item) {
    this.shadowRoot.querySelector('nx-pills')?.add(item);
  }

  _onPillsChange({ detail: { items } }) {
    this._hasItems = items.length > 0;
  }

  _applyContext(value) {
    this._context = value;
    if (this._controller) {
      this._controller.setContext(value);
    } else {
      this._ensureController(value);
    }
    this.shadowRoot.querySelector('nx-pills')?.dropKeyed();
    this._loadConfig();
    this.requestUpdate();
  }

  clear() {
    this._controller?.clear();
  }

  _closePanel() {
    this.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true, composed: true }));
  }

  async _loadConfig() {
    const { org, site } = this._context ?? {};
    if (!org || !site) return;
    const key = `${org}/${site}`;
    if (this._configKey === key) return;
    this._configKey = key;
    const { prompts, skills, mcpServers, mcpServerHeaders } = await loadSiteConfig(org, site);
    this._prompts = prompts ?? [];
    this._skills = skills ?? [];
    this._controller?.setMcpConfig(mcpServers ?? {}, mcpServerHeaders ?? {});
    this._slashMenu.refresh();
  }

  _getSlashItems(filter) {
    if (!this._skills) return [];
    const skills = this._skills.map((id) => ({ id, label: id }));
    const filtered = filter
      ? skills.filter((item) => item.id.toLowerCase().includes(filter))
      : skills;
    if (!filtered.length) return [];
    return [{ section: 'Skills' }, ...filtered];
  }

  _onSlashSelect(skillId) {
    const { message, input } = this._slashMenu.resolveSelection(skillId);
    if (input) input.value = '';
    const pills = this.shadowRoot.querySelector('nx-pills');
    const items = pills?.items ?? [];
    const contextItems = items.filter((item) => !item.dataBase64);
    const attachments = buildAttachmentPayload(items);
    const opts = { requestedSkills: [skillId], ...(attachments.length ? { attachments } : {}) };
    this._controller.sendMessage(message, contextItems, opts);
    pills?.clear();
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];

    if (this._context) this._ensureController(this._context);

    this._unsubscribeHash = hashChange.subscribe((state) => {
      if (!this._explicitContext) this._applyContext(state);
    });

    this._dnd = createFileDropHandlers({
      isAllowed: isAllowedFile,
      onDragging: (dragging) => { this._dragging = dragging; },
      onFiles: (files) => this._onFilesSelected(files),
    });
  }

  async _ensureController(context) {
    if (this._controller || this._resolvingController) return;
    const { org, site } = context ?? {};
    if (!org || !site) return;

    this._resolvingController = true;
    const useCoworker = await isCoworkerEnabled({ org, site });
    this._resolvingController = false;
    if (this._destroyed || this._controller) return;

    this._useCoworker = useCoworker;
    if (useCoworker) {
      const aoStyles = await loadStyle(new URL('./ao/ao.css', import.meta.url).href);
      this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, aoStyles];
    }

    this._controller = new ChatBackend(useCoworker, {
      onToolDone: (scope, paths) => {
        this.dispatchEvent(new CustomEvent(CHAT_EVENT.AGENT_CHANGE, {
          bubbles: true,
          composed: true,
          detail: { scope, paths },
        }));
      },
      onUpdate: ({
        messages, thinking, streamingText, connected, toolCards, pendingInteraction,
      }) => {
        const newMessages = streamingText
          ? [...(messages ?? []), { role: ROLE.ASSISTANT, content: streamingText, streaming: true }]
          : messages;
        this.thinking = thinking;
        this.connected = connected;
        this.toolCards = toolCards;
        this.pendingInteraction = pendingInteraction;
        cancelAnimationFrame(this._updateRaf);
        this._updateRaf = requestAnimationFrame(() => {
          this.messages = newMessages;
          this.thinking = thinking;
          this.connected = connected;
          this.toolCards = toolCards;
          this.pendingInteraction = pendingInteraction;
        });
      },
    });
    this._controller.setContext(this._context ?? context);
    this._controller.connect().then(() => this._controller.loadInitialMessages());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyed = true;
    cancelAnimationFrame(this._updateRaf);
    this._unsubscribeHash?.();
    this._controller?.destroy();
  }

  willUpdate(changed) {
    if (changed.has('messages')) {
      const log = this.shadowRoot?.querySelector('.chat-scroll-container');
      this._wasNearBottom = !log || (log.scrollHeight - log.scrollTop - log.clientHeight < 50);
    }
  }

  updated(changed) {
    if (changed.has('messages')) {
      const log = this.shadowRoot.querySelector('.chat-scroll-container');
      if (log && this._wasNearBottom) {
        cancelAnimationFrame(this._scrollRaf);
        this._scrollRaf = requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
      }
    }
    if (changed.has('thinking') && !this.thinking && changed.get('thinking')) {
      this.shadowRoot.querySelector('.chat-input')?.focus();
    }
    if (changed.has('connected') && this.connected && this._pendingPrompt) {
      const { text, autoSend } = this._pendingPrompt;
      this._pendingPrompt = null;
      this._sendPrompt(text, { autoSend });
    }
  }

  _openPrompts() {
    const popover = this.shadowRoot.querySelector('.prompts-popover');
    const form = this.shadowRoot.querySelector('.chat-form');
    openPopoverAbove(popover, form, {
      onOpen: () => this.shadowRoot.querySelector('nx-prompts')?.focus(),
    });
  }

  _onAddClick(e) {
    const popover = this.shadowRoot.querySelector('.prompts-popover');
    if (!popover?.open) return;
    e.stopImmediatePropagation();
    popover.close();
  }

  _handleKeydown(e) {
    if (this._slashMenu.onKeydown(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._submit();
    }
  }

  _submit(e) {
    e?.preventDefault();
    if (this.thinking) {
      this._controller.stop();
      return;
    }
    const input = this.shadowRoot.querySelector('.chat-input');
    const text = input.value.trim();
    const pills = this.shadowRoot.querySelector('nx-pills');
    const items = pills?.items ?? [];
    if (!text && !items.length) return;
    const figItems = items.filter((i) => i.figSummary);
    const fileItems = items.filter((i) => i.dataBase64);
    // Fig items carry no dataBase64 and are merged into the message text, not
    // sent as context or uploaded — exclude them from both.
    const contextItems = items.filter((i) => !i.dataBase64 && !i.figSummary);
    let defaultText = 'Attached file';
    if (figItems.length) defaultText = 'Create a landing page from this Figma design.';
    else if (fileItems.length > 1) defaultText = 'Attached files';
    const baseText = text || defaultText;
    // The parsed-figma block goes to the agent as hidden wire text — it must not
    // render in the chat (it's long, de-noised machine context, not user copy).
    const figBlock = figItems.map((i) => i.figSummary).join('\n\n');
    // Show the .fig thumbnail inline in the chat as the visual design preview.
    const figThumb = figItems.find((i) => i.thumbnail)?.thumbnail;
    const attachments = buildAttachmentPayload(items);
    this._slashMenu.close();
    this._controller.sendMessage(baseText, contextItems, {
      attachments,
      ...(figBlock ? { hiddenText: figBlock } : {}),
      ...(figThumb ? { thumbnail: figThumb } : {}),
    });
    input.value = '';
    pills?.clear();
  }

  _sendPrompt(prompt, { autoSend = false } = {}) {
    if (!prompt || this.thinking || !this.connected) return;
    this.shadowRoot.querySelector('.prompts-popover')?.close();
    const input = this.shadowRoot.querySelector('.chat-input');
    if (!input) return;
    input.value = prompt;
    if (autoSend) {
      input.closest('form')?.requestSubmit();
    } else {
      input.focus();
    }
  }

  _handleMenuSelect({ detail: { id } }) {
    if (id === MENU_OPTIONS.FILES) this._openFilePicker();
    if (id === MENU_OPTIONS.FIGMA) this._openFigPicker();
    if (id === MENU_OPTIONS.PROMPT) this._openPrompts();
    if (id === MENU_OPTIONS.COMMAND) this._slashMenu.insertSlash();
    if (id === MENU_OPTIONS.MANAGE_PROMPT || id === MENU_OPTIONS.MANAGE_SKILLS) {
      const { org, site } = this._context ?? {};
      if (!org || !site) return;
      const url = new URL(window.location.href);
      url.pathname = '/apps/skills';
      url.search = `?tab=${id}`;
      url.hash = `#/${org}/${site}`;
      window.open(url.href, '_blank', 'noopener,noreferrer');
    }
  }

  _openFilePicker() {
    this.shadowRoot.querySelector('.chat-file-input')?.click();
  }

  // "Upload .fig file": open a picker filtered to .fig. Unlike a normal
  // attachment, a .fig is stripped to its ~190KB document + parsed IN THE
  // BROWSER (see _onFigInputChange) — the ~99% that is embedded images never
  // leaves the client, and the agent receives the recovered design content
  // inline instead of the raw file.
  _openFigPicker() {
    this.shadowRoot.querySelector('.chat-fig-input')?.click();
  }

  async _onFigInputChange(e) {
    const { target } = e;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;

    const pills = this.shadowRoot.querySelector('nx-pills');
    const { org, site } = this._context ?? {};
    try {
      const buf = await file.arrayBuffer();
      // Parse the FULL file (needed for the image list + dims + layer names).
      // The raw .fig never goes to the agent — only the de-noised text + the
      // thumbnail + DA URLs of the extracted images.
      const parsed = await parseFig(new Uint8Array(buf));

      let imagesBlock = '';
      if (org && site && Array.isArray(parsed.images) && parsed.images.length) {
        const mimeByHash = new Map(parsed.images.map((im) => [im.hash, im.mime]));
        const raw = await extractFigImages(buf);
        const toUpload = raw.map((r) => ({ ...r, mime: mimeByHash.get(r.hash) }));
        const base = (parsed.file_name || file.name)
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'figma';
        const urlByHash = await uploadFigImages(toUpload, { org, site, slug: `${base}-${Date.now().toString(36)}` });
        imagesBlock = buildImagesBlock(parsed.images, urlByHash);
      }

      const summary = summarizeFigForAgent(parsed);
      // No dataBase64 → never uploaded as an attachment; _submit merges figSummary
      // into the hidden wire text and shows the thumbnail inline.
      pills?.add({
        id: crypto.randomUUID(),
        label: parsed.file_name || file.name,
        type: 'image',
        figSummary: imagesBlock ? `${summary}\n\n${imagesBlock}` : summary,
        ...(parsed.thumbnail_base64
          ? { thumbnail: `data:image/png;base64,${parsed.thumbnail_base64}` }
          : {}),
      });
    } catch (err) {
      pills?.add({
        id: crypto.randomUUID(),
        label: `Couldn't read ${file.name}: ${err.message}`,
        type: 'file',
      });
    }
  }

  async _onFilesSelected(fileList) {
    const pills = this.shadowRoot.querySelector('nx-pills');
    const currentCount = (pills?.items ?? []).filter((i) => i.dataBase64).length;
    const items = await buildAttachmentItems(fileList, { currentCount });
    items.forEach((item) => pills?.add(item));
  }

  async _onFileInputChange(e) {
    const { target } = e;
    await this._onFilesSelected(target.files);
    target.value = '';
  }

  _handlePillActivate({ detail }) {
    const { selFrom, selTo, selectionType, blockName, proseIndex } = detail;
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.HIGHLIGHT_SELECTION, {
      detail: { selFrom, selTo, selectionType, blockName, proseIndex },
    }));
  }

  render() {
    const { view } = this._context ?? {};
    const prompts = (this._prompts ?? [])
      .filter((p) => !p.area || p.area === 'all' || p.area === view);

    return html`
      <nx-popover class="prompts-popover">
        <nx-prompts
          .prompts=${prompts}
          .onSend=${(p) => this._sendPrompt(p)}
        ></nx-prompts>
      </nx-popover>
      <div class="chat-header">
        <button
          type="button"
          class="chat-header-btn clear-btn"
          aria-label="Clear chat"
          ?hidden=${!this.messages?.length}
          @click=${() => this.clear()}
        >${icon('clear')}<span>Clear</span></button>
        <button
          type="button"
          class="chat-header-btn"
          aria-label="Close chat panel"
          @click=${this._closePanel}
        >${icon('close')}</button>
      </div>
      <div class="chat-scroll-container">
        <div class="chat-messages-container" role="log" aria-live="polite">
          ${!this.messages?.length && !this.thinking
        ? html`<nx-new-chat
              .prompts=${prompts}
              .onSend=${(p) => this._sendPrompt(p)}
              @nx-show-prompts=${this._openPrompts}
            ></nx-new-chat>`
        : nothing}
        ${this.messages?.map((msg) => {
          if (msg.uiArtifact) {
            return renderUiArtifact(msg.uiArtifact, (p) => this._sendPrompt(p, { autoSend: true }));
          }
          if (msg.toolCard) return renderToolCard(msg.toolCard);
          return renderMessage(msg, this.toolCards);
        })}
        ${this.thinking && !this.messages?.at(-1)?.streaming && !this.pendingInteraction
        ? html`<div class="chat-thinking">Thinking...</div>` : nothing}
        </div>
      </div>
      <div class="chat-form-wrap">
        <nx-menu
          class="slash-menu"
          .ignoreFocus=${true}
          .scoped=${true}
          @select=${({ detail }) => this._onSlashSelect(detail.id)}
          @mousedown=${(e) => e.preventDefault()}
        ></nx-menu>
        <nx-chat-interaction
          .pending=${this.pendingInteraction}
          .onApprove=${(toolCallId, approved, always) => this._controller.approveToolCall(toolCallId, approved, always)}
          .onAnswerQuestion=${(answers) => this._controller.answerQuestion(answers)}
          .onDeclineQuestion=${() => this._controller.declineQuestion()}
          .onApprovePlan=${() => this._controller.respondToPlanApproval('approve')}
          .onRejectPlan=${(feedback) => this._controller.respondToPlanApproval('reject', feedback)}
        ></nx-chat-interaction>
        <form class="chat-form" autocomplete="off" @submit=${this._submit}
          @dragenter=${this._dnd.onDragEnter}
          @dragleave=${this._dnd.onDragLeave}
          @dragover=${this._dnd.onDragOver}
          @drop=${this._dnd.onDrop}
        >
        <input
          class="chat-file-input"
          type="file"
          accept="image/*,text/markdown,.md,application/pdf,.pdf"
          multiple
          hidden
          @change=${this._onFileInputChange}
        />
        <input
          class="chat-fig-input"
          type="file"
          accept=".fig"
          hidden
          @change=${this._onFigInputChange}
        />
        ${this._dragging ? html`
          <div class="chat-drop-zone" aria-hidden="true">
            <span class="chat-drop-title">Drop a file to add context</span>
            <span class="chat-drop-hint">Supports PDF, images, and documents</span>
          </div>` : nothing}
        <nx-pills
          addEvent=${CHAT_EVENT.ADD_TO_CHAT}
          @nx-pill-activate=${this._handlePillActivate}
          @nx-pills-change=${this._onPillsChange}
        ></nx-pills>
        <textarea
          name="chat-input"
          class="chat-input"
          placeholder="Ask anything, or type / for skills..."
          ?disabled=${this.thinking || !this.connected}
          @input=${this._slashMenu.onInput}
          @keydown=${this._handleKeydown}
          @blur=${this._slashMenu.onBlur}
        ></textarea>
        <div class="chat-actions" ?data-thinking=${this.thinking} ?data-has-items=${this._hasItems}>
          <nx-menu .items=${ADD_MENU_ITEMS} placement="above" @select=${this._handleMenuSelect}>
            <button slot="trigger" class="chat-add" type="button" aria-label="Add" @click=${this._onAddClick}>
              <span class="icon-add">${icon('add')}</span>
              <span class="icon-up">${icon('up')}</span>
            </button>
          </nx-menu>
          <button class="chat-stop action-btn" type="button" aria-label="Stop" @click=${this._submit}>${icon('stop')}</button>
          <button class="chat-send action-btn" type="submit" aria-label="Send">${icon('send')}</button>
        </div>
        </form>
      </div>
      <p class="chat-disclaimer">
        Responses are generated using AI, and may be inaccurate. Check before using.
        <a href="${ADOBE_AI_GUIDELINES_URL}" target="_blank" rel="noopener noreferrer">AI User Guidelines</a>
      </p>
    `;
  }
}

customElements.define('nx-chat', NxChat);

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
import { loadStyle, hashChange } from '../../utils/utils.js';
import { loadSiteConfig } from '../chat/utils/api.js';
import AoChatController from './ao-controller.js';
import { fetchResolvedManifestId } from './utils/manifest.js';
import {
  AO_UPLOAD_EXTENSIONS, AO_MAX_FILE_SIZE_BYTES,
  COWORKER_SKILLS_URL, COWORKER_CHAT_URL, ENTERPRISE_CONTEXT_URL,
  ADD_MENU_ITEMS, ADD_MENU_ITEMS_WITH_EPISODE,
} from './ao-constants.js';
import { getConfig } from '../../scripts/nx.js';
import { CHAT_EVENT } from '../../utils/chat.js';
import { PANEL_EVENT } from '../../utils/panel.js';
import { createFileDropHandlers } from '../shared/chat/dnd.js';
import { openPopoverAbove } from '../shared/chat/positioning.js';
import { buildAttachmentItems } from '../shared/chat/files.js';
import { createVoiceInput, isVoiceInputSupported, appendTranscript } from './utils/voice-input.js';
import { showToast } from '../shared/toast/toast.js';
import { renderAssistantMessageBody, renderPlanApprovalCard, renderPermissionCard } from './renderers.js';
import { renderSelectionPills } from '../shared/chat/selection-pills.js';
import { createSlashMenu } from '../shared/chat/slash-menu.js';
import '../shared/pills/pills.js';
import '../shared/menu/menu.js';
import '../shared/popover/popover.js';
import '../shared/picker/picker.js';
import '../shared/chat/prompts/prompts.js';
import '../shared/chat/new-chat/new-chat.js';
import './question-card/question-card.js';
import { ADOBE_AI_GUIDELINES_URL, ICON_NAMES, MENU_OPTIONS } from '../shared/chat/constants.js';

const styles = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);
const artifactStyle = await loadStyle(new URL('./artifacts/artifacts.css', import.meta.url).href);

const { codeBase } = getConfig();

const icon = (name) => html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${ICON_NAMES[name]}.svg#icon"></use></svg>`;

function isAllowedFile(file) {
  const name = file.name?.toLowerCase() ?? '';
  return AO_UPLOAD_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default class NxChatAo extends LitElement {
  static properties = {
    messages: { type: Array },
    thinking: { type: Boolean },
    episodes: { type: Array },
    episodeId: { type: String },
    pendingQuestion: { type: Object },
    pendingPlanApproval: { type: Object },
    pendingPermission: { type: Object },
    loadingEpisode: { type: Boolean },
    _dragging: { state: true },
    _prompts: { state: true },
    _planFeedback: { state: true },
    _voiceListening: { state: true },
  };

  _slashMenu = createSlashMenu(this, { getItems: (filter) => this._getSlashItems(filter) });

  // Tracks the last interim chunk inserted into .chat-input so the next
  // chunk can replace it in place — see utils/voice-input.js#appendTranscript.
  _voiceInterim = '';

  set context(value) {
    this._explicitContext = true;
    this._applyContext(value);
  }

  // See docs/chat-ao-component.md#plan-approval — a pending plan, unlike a
  // pending question, doesn't disable the input.
  get _blocked() {
    return this.thinking && !this.pendingPlanApproval;
  }

  _applyContext(value) {
    this._context = value;
    this._controller?.setContext(value);
    this._loadConfig();
  }

  async _loadConfig() {
    const { org, site } = this._context ?? {};
    if (!org || !site) return;
    const key = `${org}/${site}`;
    if (this._configKey === key) return;
    this._configKey = key;
    const { prompts } = await loadSiteConfig(org, site);
    this._prompts = prompts ?? [];
  }

  _closePanel() {
    this.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true, composed: true }));
  }

  _openPrompts() {
    const popover = this.shadowRoot.querySelector('.prompts-popover');
    const form = this.shadowRoot.querySelector('.chat-form');
    openPopoverAbove(popover, form, {
      onOpen: () => this.shadowRoot.querySelector('nx-prompts')?.focus(),
    });
  }

  _sendPrompt(prompt, { autoSend = false } = {}) {
    if (!prompt || this._blocked) return;
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

  _episodeLabel(episode) {
    if (episode.title) return episode.title;
    if (episode.id === this.episodeId) {
      const firstUserMessage = this.messages?.find((msg) => msg.role === 'user')?.content;
      if (firstUserMessage) return firstUserMessage;
    }
    return new Date(episode.updated_at).toLocaleString();
  }

  _sessionFallbackLabel() {
    const active = this.episodes?.find((ep) => ep.id === this.episodeId);
    if (active?.title) return '';
    return this.messages?.find((msg) => msg.role === 'user')?.content ?? 'New session';
  }

  _handleNewSession() {
    this._controller.startNewEpisode();
    this.shadowRoot.querySelector('.chat-input')?.focus();
  }

  _handleEpisodeChange({ detail: { value } }) {
    this._controller.switchEpisode(value);
  }

  _handlePillActivate({ detail }) {
    const { selFrom, selTo, selectionType, blockName, proseIndex } = detail;
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.HIGHLIGHT_SELECTION, {
      detail: { selFrom, selTo, selectionType, blockName, proseIndex },
    }));
  }

  connectedCallback() {
    super.connectedCallback();
    fetchResolvedManifestId();
    this.shadowRoot.adoptedStyleSheets = [styles, buttonStyle, artifactStyle];
    this._controller = new AoChatController({
      onUpdate: ({
        messages, thinking, streamingText, episodes, episodeId,
        pendingQuestion, pendingPlanApproval, pendingPermission, loadingEpisode,
      }) => {
        this.messages = streamingText
          ? [...(messages ?? []), { role: 'assistant', content: streamingText, streaming: true }]
          : messages;
        this.thinking = thinking;
        this.episodes = episodes;
        this.episodeId = episodeId;
        this.pendingQuestion = pendingQuestion;
        this.pendingPlanApproval = pendingPlanApproval;
        this.pendingPermission = pendingPermission;
        this.loadingEpisode = loadingEpisode;
      },
    });
    if (this._context) this._controller.setContext(this._context);
    this._controller.loadEpisodes();
    this._controller.loadSkills();
    this._dnd = createFileDropHandlers({
      isAllowed: isAllowedFile,
      onDragging: (dragging) => { this._dragging = dragging; },
      onFiles: (files) => this._onFilesSelected(files),
    });
    this._unsubscribeHash = hashChange.subscribe((state) => {
      if (!this._explicitContext) this._applyContext(state);
    });
    // See docs/chat-ao-component.md#connection-recovery for why this exists.
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible') this._controller.reattachIfIdle();
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    this._voice = createVoiceInput({
      onStart: () => { this._voiceListening = true; },
      onEnd: () => { this._voiceListening = false; this._voiceInterim = ''; },
      onInterimText: (text) => this._handleVoiceText(text, true),
      onFinalText: (text) => {
        this._handleVoiceText(text, false);
        this.shadowRoot.querySelector('.chat-input')?.focus();
      },
      onError: (message) => showToast({ text: message, variant: 'error' }),
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._controller?.destroy();
    this._unsubscribeHash?.();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this._voice?.stop();
  }

  willUpdate(changed) {
    if (changed.has('pendingPlanApproval') && this.pendingPlanApproval?.turnId !== changed.get('pendingPlanApproval')?.turnId) {
      this._planFeedback = '';
    }
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

    if (changed.has('pendingPermission') && this.pendingPermission && !changed.get('pendingPermission')) {
      this.shadowRoot.querySelector('.permission-approve-btn')?.focus();
    }
  }

  _getSlashItems(filter) {
    const skills = this._controller.getSkills().map((id) => ({ id, label: id }));
    const filtered = filter
      ? skills.filter((item) => item.id.toLowerCase().includes(filter))
      : skills;
    if (!filtered.length) return [];
    return [{ section: 'Skills' }, ...filtered];
  }

  _onSlashSelect(skillId) {
    const { message, input } = this._slashMenu.resolveSelection(skillId);
    const pills = this.shadowRoot.querySelector('nx-pills');
    const items = pills?.items ?? [];
    const attachments = items.filter((i) => i.dataBase64);
    const context = items.filter((i) => !i.dataBase64);
    this._controller.sendMessage(message, context, attachments);
    input.value = '';
    pills?.clear();
  }

  _submit(e) {
    e?.preventDefault();
    if (this._blocked) {
      this._controller.stop();
      return;
    }
    const input = this.shadowRoot.querySelector('.chat-input');
    const text = input.value.trim();
    if (!text) return;
    const pills = this.shadowRoot.querySelector('nx-pills');
    const items = pills?.items ?? [];
    const attachments = items.filter((i) => i.dataBase64);
    const context = items.filter((i) => !i.dataBase64);
    this._slashMenu.close();
    this._controller.sendMessage(text, context, attachments);
    input.value = '';
    pills?.clear();
  }

  _handleInput(e) {
    this._slashMenu.onInput(e);
    this._controller.warmSession();
  }

  _handleKeydown(e) {
    if (this._slashMenu.onKeydown(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._submit();
    }
  }

  _handleMenuSelect({ detail: { id } }) {
    if (id === MENU_OPTIONS.FILES) this._openFilePicker();
    if (id === MENU_OPTIONS.PROMPT) this._openPrompts();
    if (id === MENU_OPTIONS.COMMAND) this._slashMenu.insertSlash();
    if (id === MENU_OPTIONS.MANAGE_PROMPT) this._openConfigPage();
    if (id === MENU_OPTIONS.MANAGE_SKILLS) window.open(COWORKER_SKILLS_URL, '_blank', 'noopener,noreferrer');
    if (id === MENU_OPTIONS.OPEN_COWORKER && this.episodeId) window.open(`${COWORKER_CHAT_URL}/${this.episodeId}`, '_blank', 'noopener,noreferrer');
    if (id === MENU_OPTIONS.MANAGE_ENTERPRISE_CONTEXT) window.open(ENTERPRISE_CONTEXT_URL, '_blank', 'noopener,noreferrer');
  }

  _openConfigPage() {
    const { org, site } = this._context ?? {};
    if (!org || !site) return;
    const url = new URL(window.location.href);
    url.pathname = '/config';
    url.search = '';
    url.hash = `#/${org}/${site}/`;
    window.open(url.href, '_blank', 'noopener,noreferrer');
  }

  _openFilePicker() {
    this.shadowRoot.querySelector('.chat-file-input')?.click();
  }

  async _onFilesSelected(fileList) {
    const pills = this.shadowRoot.querySelector('nx-pills');
    const currentCount = (pills?.items ?? []).filter((i) => i.dataBase64).length;
    const items = await buildAttachmentItems(fileList, {
      currentCount, maxFileSize: AO_MAX_FILE_SIZE_BYTES,
    });
    items.forEach((item) => pills?.add(item));
  }

  async _onFileInputChange(e) {
    const { target } = e;
    await this._onFilesSelected(target.files);
    target.value = '';
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
        ${this.episodes?.length ? html`
          <nx-picker
            class="session-picker"
            .items=${this.episodes.map((ep) => ({ value: ep.id, label: this._episodeLabel(ep) }))}
            .value=${this.episodeId}
            .labelOverride=${this._sessionFallbackLabel()}
            placement="below"
            @change=${this._handleEpisodeChange}
          ></nx-picker>` : nothing}
        <div>
          <button type="button" class="nx-action-btn-quiet nx-btn-sm" @click=${this._handleNewSession}>
            ${icon('add')}
            <span>New session</span>
          </button>
          <button
            class="nx-action-btn-icon nx-btn-sm"
            aria-label="Close chat panel"
            @click=${this._closePanel}
          >${icon('close')}</button>
        </div>
      </div>
      <div class="chat-scroll-container">
        <div class="chat-messages-container" role="log" aria-live="polite">
          ${this.loadingEpisode ? html`
            <div class="chat-loading"><span class="nx-loading-spinner"></span></div>
          ` : html`
            ${!this.messages?.length && !this.thinking
          ? html`<nx-new-chat
              .prompts=${prompts}
              .onSend=${(p) => this._sendPrompt(p)}
              @nx-show-prompts=${this._openPrompts}
            ></nx-new-chat>`
          : nothing}
            ${this.messages?.map((msg) => (msg.role === 'assistant' ? html`
              <div class="message message-assistant">
                ${renderAssistantMessageBody(msg, {
            onExpandToolCall: (toolCallId) => this._controller.hydrateToolCall(toolCallId),
          })}
              </div>
            ` : html`
              <div class="message message-user">
                ${renderSelectionPills(msg)}
                <div class="message-content">${msg.content}</div>
              </div>
            `))}
            ${this.pendingPlanApproval ? renderPlanApprovalCard(this.pendingPlanApproval, this._planFeedback ?? '', {
            onFeedbackText: (text) => { this._planFeedback = text; },
            onApprove: () => this._controller.respondToPlanApproval('approve'),
            onReject: () => this._controller.respondToPlanApproval('reject', this._planFeedback?.trim() ?? ''),
          }) : nothing}
            ${this.thinking && !this.pendingPlanApproval && !this.messages?.at(-1)?.streaming
          ? html`<div class="chat-thinking">Thinking...</div>` : nothing}
          `}
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
        <nx-question-card
          .pending=${this.pendingQuestion}
          .onSubmit=${(answers) => this._controller.answerQuestion(answers)}
          .onDecline=${() => this._controller.declineQuestion()}
        ></nx-question-card>
        ${renderPermissionCard(this.pendingPermission, {
            onDecide: (id, approved) => this._controller.respondToPermission(id, approved),
          })}
        <form class="chat-form" @submit=${this._submit}
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
          <nx-pills
            addEvent=${CHAT_EVENT.ADD_TO_CHAT}
            @nx-pill-activate=${this._handlePillActivate}
          ></nx-pills>
          <input
            class="chat-file-input"
            type="file"
            accept=${AO_UPLOAD_EXTENSIONS.join(',')}
            multiple
            hidden
            @change=${this._onFileInputChange}
          />
          <textarea
            class="chat-input"
            placeholder="Ask anything, or type / for skills..."
            ?disabled=${this._blocked}
            @input=${this._handleInput}
            @keydown=${this._handleKeydown}
            @blur=${this._slashMenu.onBlur}
          ></textarea>
          <div class="chat-actions" ?data-thinking=${this._blocked} ?data-voice-listening=${this._voiceListening}>
            <nx-menu .items=${this.episodeId ? ADD_MENU_ITEMS_WITH_EPISODE : ADD_MENU_ITEMS} placement="above" @select=${this._handleMenuSelect}>
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
                  ?disabled=${this._blocked}
                  aria-pressed=${this._voiceListening}
                  aria-label=${this._voiceListening ? 'Stop recording' : 'Use voice input'}
                  @click=${this._toggleVoiceInput}
                >${icon('mic')}</button>
              ` : nothing}
              <button
                class="chat-stop nx-action-btn-icon is-active nx-btn-sm"
                ?hidden=${!this._blocked}
                @click=${this._submit}
              > ${icon('stop')}</button>
              <button type="submit" class="chat-send nx-action-btn-icon is-active nx-btn-sm" ?hidden=${this._blocked} aria-label="Send">
                ${icon('send')}
              </button>
            </div>
          </div>
        </form>
      </div>
      <p class="chat-disclaimer">
        Responses are generated using AI, and may be inaccurate.
        <a href="${ADOBE_AI_GUIDELINES_URL}" target="_blank" rel="noopener noreferrer">AI User Guidelines</a>
      </p>
    `;
  }
}

if (!customElements.get('nx-chat-ao')) customElements.define('nx-chat-ao', NxChatAo);

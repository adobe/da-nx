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
import { loadStyle } from '../../utils/utils.js';
import AoChatController from './ao-controller.js';
import { AO_UPLOAD_EXTENSIONS, AO_MAX_FILE_SIZE_BYTES, COWORKER_SKILLS_URL } from './ao-constants.js';
import { getConfig } from '../../scripts/nx.js';
import { CHAT_EVENT } from '../../utils/chat.js';
import { PANEL_EVENT } from '../../utils/panel.js';
import { createFileDropHandlers } from '../shared/chat/dnd.js';
import { buildAttachmentItems } from '../shared/chat/files.js';
import '../shared/pills/pills.js';
import '../shared/menu/menu.js';
import { ADD_MENU_ITEMS, ADOBE_AI_GUIDELINES_URL, MENU_OPTIONS } from '../shared/chat/constants.js';

const styles = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);

const { codeBase } = getConfig();

const ICON_NAMES = {
  add: 's2-icon-add-20-n',
  close: 's2-icon-splitleft-20-n',
  send: 's2-icon-arrowupsend-20-n',
  stop: 's2-icon-stop-20-n',
};

const icon = (name) => html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${ICON_NAMES[name]}.svg#icon"></use></svg>`;

function isAllowedFile(file) {
  const name = file.name?.toLowerCase() ?? '';
  return AO_UPLOAD_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default class NxChatAo extends LitElement {
  static properties = {
    messages: { type: Array },
    thinking: { type: Boolean },
    _dragging: { state: true },
  };

  _closePanel() {
    this.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true, composed: true }));
  }

  _handlePillActivate({ detail }) {
    const { selFrom, selTo, selectionType, blockName, proseIndex } = detail;
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.HIGHLIGHT_SELECTION, {
      detail: { selFrom, selTo, selectionType, blockName, proseIndex },
    }));
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles, buttonStyle];
    this._controller = new AoChatController({
      onUpdate: ({ messages, thinking, streamingText }) => {
        this.messages = streamingText
          ? [...(messages ?? []), { role: 'assistant', content: streamingText, streaming: true }]
          : messages;
        this.thinking = thinking;
      },
    });
    this._dnd = createFileDropHandlers({
      isAllowed: isAllowedFile,
      onDragging: (dragging) => { this._dragging = dragging; },
      onFiles: (files) => this._onFilesSelected(files),
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._controller?.destroy();
  }

  updated(changed) {
    if (changed.has('messages')) {
      const log = this.shadowRoot.querySelector('.chat-scroll-container');
      if (log) log.scrollTop = log.scrollHeight;
    }
    if (changed.has('thinking') && !this.thinking && changed.get('thinking')) {
      this.shadowRoot.querySelector('.chat-input')?.focus();
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
    if (!text) return;
    const pills = this.shadowRoot.querySelector('nx-pills');
    const items = pills?.items ?? [];
    const attachments = items.filter((i) => i.dataBase64);
    const context = items.filter((i) => !i.dataBase64);
    this._controller.sendMessage(text, context, attachments);
    input.value = '';
    pills?.clear();
  }

  _handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._submit();
    }
  }

  _handleMenuSelect({ detail: { id } }) {
    if (id === MENU_OPTIONS.FILES) this._openFilePicker();
    if (id === MENU_OPTIONS.MANAGE_SKILLS) window.open(COWORKER_SKILLS_URL, '_blank', 'noopener,noreferrer');
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
    return html`
      <div class="chat-header">
        <button
          class="nx-action-btn-icon nx-btn-sm"
          aria-label="Close chat panel"
          @click=${this._closePanel}
        >${icon('close')}</button>
      </div>
      <div class="chat-scroll-container">
        <div class="chat-messages-container" role="log" aria-live="polite">
          ${!this.messages?.length && !this.thinking
        ? html`<p class="chat-empty">Ask anything to get started.</p>`
        : nothing}
          ${this.messages?.map((msg) => html`
            <div class="message message-${msg.role}">${msg.content}</div>
          `)}
          ${this.thinking && !this.messages?.at(-1)?.streaming
        ? html`<div class="chat-thinking">Thinking...</div>` : nothing}
        </div>
      </div>
      <div class="chat-form-wrap">
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
            ?disabled=${this.thinking}
            @keydown=${this._handleKeydown}
          ></textarea>
          <div class="chat-actions" ?data-thinking=${this.thinking}>
            <nx-menu .items=${ADD_MENU_ITEMS} placement="above" @select=${this._handleMenuSelect}>
              <button slot="trigger" class="chat-add nx-action-btn-icon nx-btn-sm" type="button" aria-label="Add">
                ${icon('add')}
              </button>
            </nx-menu>
            <button
              class="chat-stop nx-btn-primary nx-btn-sm"
              ?hidden=${!this.thinking}
              @click=${this._submit}
            > ${icon('stop')}</button>
            <button type="submit" class="chat-send nx-btn-primary nx-btn-sm" ?hidden=${this.thinking} aria-label="Send">
              ${icon('send')}
            </button>
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

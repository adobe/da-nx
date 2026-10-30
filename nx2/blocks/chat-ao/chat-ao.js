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
import CoworkerChatController from './coworker-chat-controller.js';
import CmaChatController from './cma-chat-controller.js';
import { getCoworkerConfig } from '../../utils/ewFlags.js';
import { fetchResolvedManifestId } from './utils/manifest.js';
import {
  COWORKER_SKILLS_PATH, ENTERPRISE_CONTEXT_PATH, getCoworkerHref, loadCoworkerNav,
} from './utils/coworker-nav.js';
import {
  ADD_MENU_ITEMS, ADD_MENU_ITEMS_WITH_EPISODE,
} from './ao-constants.js';
import { getConfig } from '../../scripts/nx.js';
import { CHAT_EVENT } from '../../utils/chat.js';
import { PANEL_EVENT } from '../../utils/panel.js';
import { renderAssistantMessageBody, renderPlanApprovalCard, renderPermissionCard } from './renderers.js';
import { renderSelectionPills } from '../shared/chat/selection-pills.js';
import { showToast } from '../shared/toast/toast.js';
import '../shared/picker/picker.js';
import '../shared/chat/new-chat/new-chat.js';
import './question-card/question-card.js';
import './input.js';
import { ADOBE_AI_GUIDELINES_URL, ICON_NAMES, MENU_OPTIONS } from '../shared/chat/constants.js';

const styles = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);
const spinnerStyle = await loadStyle(new URL('../../styles/spinner.css', import.meta.url).href);
const artifactStyle = await loadStyle(new URL('./artifacts/artifacts.css', import.meta.url).href);

const { codeBase } = getConfig();

const icon = (name) => html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${ICON_NAMES[name]}.svg#icon"></use></svg>`;

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
    staleEpisode: { type: Object },
    _prompts: { state: true },
    _planFeedback: { state: true },
  };

  set context(value) {
    this._explicitContext = true;
    this._applyContext(value);
  }

  set harnessConfig(value) {
    this._applyHarnessConfig(value);
  }

  async setPrompt(text, { autoSend = false } = {}) {
    await this.updateComplete;
    await this._input?.setPrompt(text, { autoSend });
  }

  get _input() {
    return this.shadowRoot.querySelector('nx-ao-input');
  }

  // See docs/chat-ao-component.md#plan-approval — a pending plan, unlike a
  // pending question, doesn't disable the input.
  get _blocked() {
    return this.thinking && !this.pendingPlanApproval;
  }

  get _visiblePrompts() {
    const { view } = this._context ?? {};
    if (!this._promptCache
      || this._promptCache.source !== this._prompts
      || this._promptCache.view !== view) {
      this._promptCache = {
        source: this._prompts,
        view,
        items: (this._prompts ?? []).filter((p) => !p.area || p.area === 'all' || p.area === view),
      };
    }
    return this._promptCache.items;
  }

  _applyContext(value) {
    this._context = value;
    this._controller?.setContext(value);
    this._loadConfig();
  }

  _applyHarnessConfig({ key = null, altHarness = false, activationKey = null } = {}) {
    this._harnessConfigKey = key;
    this._altHarness = !!altHarness;
    this._activationKey = activationKey;
    this._flagsReady = true;
    this._initController();
  }

  async _loadConfig() {
    const { org, site } = this._context ?? {};
    if (!org || !site) return;
    const key = `${org}/${site}`;
    if (this._configKey === key) return;
    this._configKey = key;
    const { prompts } = await loadSiteConfig(org, site);
    this._prompts = prompts ?? [];
    if (this._harnessConfigKey !== key) {
      // ew.altHarness selects the CMA bridge harness; its value is the
      // activation key that authorizes/routes the chat socket to the bridge.
      const { altHarness, activationKey } = await getCoworkerConfig({ org, site });
      this._applyHarnessConfig({ key, altHarness, activationKey });
      return;
    }
    this._initController();
  }

  _onControllerUpdate({
    messages, thinking, streamingText, episodes, episodeId,
    pendingQuestion, pendingPlanApproval, pendingPermission, loadingEpisode, staleEpisode,
  }) {
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
    this.staleEpisode = staleEpisode;
  }

  // The controller is created once the ew.altHarness flag is known, so the
  // correct harness subclass (Coworker REST history vs CMA bridge) is chosen up
  // front. Idempotent; recreates only if the harness actually changes. See
  // docs/chat-ao-controller-decoupling.md.
  _initController() {
    if (!this.isConnected || !this._flagsReady || !this._context?.org || !this._context?.site) {
      return;
    }
    const Controller = this._altHarness ? CmaChatController : CoworkerChatController;
    if (this._controller instanceof Controller) {
      this._controller.setActivationKey?.(this._activationKey);
      return;
    }
    this._controller?.destroy();
    this._controller = new Controller({
      onUpdate: (state) => this._onControllerUpdate(state),
      onTurnCompleted: (detail) => {
        this.dispatchEvent(new CustomEvent(CHAT_EVENT.TURN_COMPLETED, {
          bubbles: true, composed: true, detail,
        }));
      },
      ...(this._altHarness ? { activationKey: this._activationKey } : {}),
    });
    if (this._context) this._controller.setContext(this._context);
    this._controller.loadEpisodes();
    this._controller.loadSkills();
  }

  _closePanel() {
    this.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true, composed: true }));
  }

  _openPrompts() {
    this._input?.openPrompts();
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
    this._input?.focusInput();
  }

  _continueStaleEpisode() {
    if (!this.staleEpisode) return;
    this._controller.switchEpisode(this.staleEpisode.id);
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
    this._loadCoworkerNav();
    this.shadowRoot.adoptedStyleSheets = [styles, buttonStyle, spinnerStyle, artifactStyle];
    this._initController();
    this._unsubscribeHash = hashChange.subscribe((state) => {
      if (!this._explicitContext) this._applyContext(state);
    });
    // See docs/chat-ao-component.md#connection-recovery for why this exists.
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible') this._controller.reattachIfIdle();
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    this._onSetPromptEvent = ({ detail }) => {
      this.setPrompt(detail.text, { autoSend: detail.autoSend });
    };
    document.addEventListener(CHAT_EVENT.SET_PROMPT, this._onSetPromptEvent);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._controller?.destroy();
    this._unsubscribeHash?.();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    document.removeEventListener(CHAT_EVENT.SET_PROMPT, this._onSetPromptEvent);
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
      this._input?.focusInput();
    }

    if (changed.has('pendingPermission') && this.pendingPermission && !changed.get('pendingPermission')) {
      this.shadowRoot.querySelector('.permission-approve-btn')?.focus();
    }
  }

  _getSkills = () => this._controller?.getSkills() ?? [];

  _stop = () => this._controller.stop();

  _warmSession = () => this._controller.warmSession();

  _submit = ({ text, context, attachments }) => {
    this._controller.sendMessage(text, context, attachments);
  };

  _handleMenuSelect = (id) => {
    if (id === MENU_OPTIONS.MANAGE_PROMPT) this._openConfigPage();
    if (id === MENU_OPTIONS.MANAGE_SKILLS) this._openCoworker(COWORKER_SKILLS_PATH);
    if (id === MENU_OPTIONS.OPEN_COWORKER && this.episodeId) this._openCoworker(this.episodeId);
    if (id === MENU_OPTIONS.MANAGE_ENTERPRISE_CONTEXT) this._openCoworker(ENTERPRISE_CONTEXT_PATH);
  };

  async _loadCoworkerNav() {
    this._coworkerNav = undefined;
    try {
      this._coworkerNav = await loadCoworkerNav();
    } catch (error) {
      showToast({ text: error.message, variant: 'error' });
    }
  }

  _openCoworker(path) {
    try {
      const href = this._coworkerNav?.(path) ?? getCoworkerHref({ path });
      window.open(href, '_blank', 'noopener,noreferrer');
    } catch (error) {
      showToast({ text: error.message, variant: 'error' });
    }
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

  render() {
    const prompts = this._visiblePrompts;

    return html`
      <div class="chat-header">
        ${this.episodes?.length ? html`
          <nx-picker
            class="session-picker"
            size="m"
            .items=${this.episodes.map((ep) => ({ value: ep.id, label: this._episodeLabel(ep) }))}
            .value=${this.episodeId}
            .labelOverride=${this._sessionFallbackLabel()}
            placement="below"
            @change=${this._handleEpisodeChange}
          ></nx-picker>` : nothing}
        <div>
          <button type="button" title="New chat" aria-label="New chat" class="nx-action-btn-icon" @click=${this._handleNewSession}>
            ${icon('newChat')}
          </button>
          <button
            class="nx-action-btn-icon"
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
              .onSend=${(p) => this.setPrompt(p)}
              .lastSession=${this.staleEpisode ? {
              preview: this.staleEpisode.title || 'Your previous conversation',
              updatedAt: this.staleEpisode.updated_at,
            } : undefined}
              .onContinue=${() => this._continueStaleEpisode()}
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
        <nx-question-card
          .pending=${this.pendingQuestion}
          .onSubmit=${(answers) => this._controller.answerQuestion(answers)}
          .onDecline=${() => this._controller.declineQuestion()}
        ></nx-question-card>
        ${renderPermissionCard(this.pendingPermission, {
            onDecide: (id, approved) => this._controller.respondToPermission(id, approved),
          })}
        <nx-ao-input
          .blocked=${this._blocked}
          .altHarness=${this._altHarness}
          .prompts=${prompts}
          .menuItems=${this.episodeId ? ADD_MENU_ITEMS_WITH_EPISODE : ADD_MENU_ITEMS}
          .addEvent=${CHAT_EVENT.ADD_TO_CHAT}
          .getSkills=${this._getSkills}
          .onSubmit=${this._submit}
          .onStop=${this._stop}
          .onInput=${this._warmSession}
          .onMenuSelect=${this._handleMenuSelect}
          @nx-pill-activate=${this._handlePillActivate}
        ></nx-ao-input>
      </div>
      <p class="chat-disclaimer">
        Responses are generated using AI, and may be inaccurate. Check before using. 
        <a href="${ADOBE_AI_GUIDELINES_URL}" target="_blank" rel="noopener noreferrer">AI User Guidelines</a>
      </p>
    `;
  }
}

if (!customElements.get('nx-chat-ao')) customElements.define('nx-chat-ao', NxChatAo);

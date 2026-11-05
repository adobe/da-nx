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
import { resolveHarness } from '../../utils/ewFlags.js';
import { getAoSession, getSessionScope, subscribeChatEvents } from './session.js';
import { fetchResolvedManifestId } from './utils/manifest.js';
import {
  COWORKER_SKILLS_PATH, ENTERPRISE_CONTEXT_PATH, getCoworkerHref, loadCoworkerNav,
} from './utils/coworker-nav.js';
import {
  ADD_MENU_ITEMS, ADD_MENU_ITEMS_WITH_EPISODE, ADD_MENU_ITEMS_CMA,
} from './ao-constants.js';
import { getConfig } from '../../scripts/nx.js';
import { CHAT_EVENT, skillsAppHref } from '../../utils/chat.js';
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

  _contextEvent = `nx-chat-context-${crypto.randomUUID()}`;

  get isolated() { return !!this._isolated; }

  set isolated(value) {
    this._isolated = !!value;
    this._initController();
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
    this._initController();
    this._loadConfig();
  }

  _applyHarnessConfig({ key = null, harness = 'coworker' } = {}) {
    this._harnessConfigKey = key;
    this._harness = harness;
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
    if (this._configKey !== key) return;
    this._prompts = prompts ?? [];
    if (this._harnessConfigKey !== key) {
      // Resolve the harness for this org/site (legacy | coworker | cma) via
      // the shared resolver. CMA needs the flag + entitlement, both re-verified
      // server-side by the bridge.
      const harness = await resolveHarness({ org, site });
      if (this._configKey !== key) return;
      this._applyHarnessConfig({ key, harness });
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

  // Creates/joins the session once flags + entitlement are known, picking the
  // correct harness subclass up front. Idempotent; re-joins only on scope or
  // isolation change. See docs/chat-ao-controller-decoupling.md.
  _initController() {
    if (!this.isConnected) return;
    const { org, site } = this._context ?? {};
    const configKey = `${org}/${site}`;
    if (!this._flagsReady || !org || !site || this._harnessConfigKey !== configKey) {
      if (this._session) {
        this._releaseSession();
        this._releaseSession = undefined;
        this._session = undefined;
        this._controller = undefined;
        this._onControllerUpdate({ messages: [], loadingEpisode: true });
      }
      return;
    }
    const scope = getSessionScope({ org, site, harness: this._harness });
    if (this._session?.scope === scope && this._session.isolated === this.isolated) return;
    this._releaseSession?.();
    this._session = getAoSession({
      context: this._context,
      owner: this,
      isolated: this.isolated,
      harness: this._harness,
    });
    this._controller = this._session.controller;
    this._releaseSession = this._session.subscribe(this, {
      onUpdate: (state) => this._onControllerUpdate(state),
      onTurnCompleted: (detail) => {
        this.dispatchEvent(new CustomEvent(CHAT_EVENT.TURN_COMPLETED, {
          bubbles: true, composed: true, detail,
        }));
      },
    });
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
    this._controller?.startNewEpisode();
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
    this._unsubscribeEvents = subscribeChatEvents(this, {
      getContext: () => this._context,
      getSession: () => this._session,
      onPrompt: ({ text, autoSend }) => this.setPrompt(text, { autoSend }),
      onContext: (detail) => {
        document.dispatchEvent(new CustomEvent(this._contextEvent, { detail }));
      },
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._releaseSession?.();
    this._releaseSession = undefined;
    this._session = undefined;
    this._controller = undefined;
    cancelAnimationFrame(this._scrollRaf);
    this._unsubscribeHash?.();
    this._unsubscribeEvents?.();
    this._unsubscribeHash = undefined;
    this._unsubscribeEvents = undefined;
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
    if (changed.has('thinking') && !this.thinking && changed.get('thinking')
      && this.shadowRoot.activeElement) {
      this._input?.focusInput();
    }

    if (changed.has('pendingPermission') && this.pendingPermission && !changed.get('pendingPermission')) {
      this.shadowRoot.querySelector('.permission-approve-btn')?.focus();
    }
  }

  _getSkills = () => this._controller?.getSkills() ?? [];

  _stop = () => this._controller?.stop();

  _warmSession = () => this._controller?.warmSession();

  _submit = ({ text, context, attachments }) => {
    const args = [text, context, attachments];
    if (this._session) return this._session.send({ context: this._context, args });
    return !!this._controller && this._controller.sendMessage(...args) !== false;
  };

  // CMA never shows Coworker items; Coworker shows "Continue in Coworker" with an episode.
  get _menuItems() {
    if (this._harness === 'cma') return ADD_MENU_ITEMS_CMA;
    return this.episodeId ? ADD_MENU_ITEMS_WITH_EPISODE : ADD_MENU_ITEMS;
  }

  _handleMenuSelect = (id) => {
    const actions = {
      [MENU_OPTIONS.MANAGE_PROMPT]: () => this._openConfigPage(),
      [MENU_OPTIONS.MANAGE_SKILLS]: () => (this._harness === 'cma'
        ? this._openSkillsApp()
        : this._openCoworker(COWORKER_SKILLS_PATH)),
      [MENU_OPTIONS.OPEN_COWORKER]: () => {
        if (this.episodeId) this._openCoworker(this.episodeId);
      },
      [MENU_OPTIONS.MANAGE_ENTERPRISE_CONTEXT]: () => this._openCoworker(ENTERPRISE_CONTEXT_PATH),
    };
    actions[id]?.();
  };

  // CMA: skills live in the ew-extensions skills app, not CX Coworker.
  _openSkillsApp() {
    const { org, site } = this._context ?? {};
    if (!org || !site) return;
    const href = skillsAppHref({ org, site, tab: MENU_OPTIONS.MANAGE_SKILLS });
    window.open(href, '_blank', 'noopener,noreferrer');
  }

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
            title="Close chat panel"
            aria-label="Close chat panel"
            @click=${this._closePanel}
          >${icon('closechat')}</button>
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
          .harness=${this._harness}
          .prompts=${prompts}
          .menuItems=${this._menuItems}
          .addEvent=${this._contextEvent}
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

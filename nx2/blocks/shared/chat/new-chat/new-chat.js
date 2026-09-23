import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../utils/utils.js';
import { loadIms } from '../../../../utils/ims.js';
import { getConfig } from '../../../../scripts/nx.js';

const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Coarse "Xh/Xd ago" — this card only needs a rough sense of recency, not precision.
function relativeTimeFromNow(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  if (!(diffMs >= 0)) return null;
  if (diffMs < HOUR_MS) return `${Math.max(Math.round(diffMs / MINUTE_MS), 1)}m ago`;
  if (diffMs < DAY_MS) return `${Math.round(diffMs / HOUR_MS)}h ago`;
  return `${Math.round(diffMs / DAY_MS)}d ago`;
}

class NxNewChat extends LitElement {
  static properties = {
    prompts: { attribute: false },
    lastSession: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    loadIms().then(({ first_name: firstName, displayName }) => {
      this._firstName = firstName ?? displayName?.split(' ')[0];
      this.requestUpdate();
    });
  }

  _showMore() {
    this.dispatchEvent(new CustomEvent('nx-show-prompts', { bubbles: true, composed: true }));
  }

  render() {
    const greeting = `Welcome${this._firstName ? `, ${this._firstName}` : ''}`;
    const prompts = this.prompts ?? [];
    const lastActive = this.lastSession ? relativeTimeFromNow(this.lastSession.updatedAt) : null;
    const isCompact = !!this.lastSession;

    return html`
      <div class="chat-welcome-message ${isCompact ? 'chat-welcome-message-compact' : ''}">
        <h3>${greeting}</h3>
        <p>What are we working on today?</p>
      </div>
      ${this.lastSession ? html`
        <button class="prompt-card continue-session-card" @click=${() => this.onContinue?.()}>
          <svg class="prompt-card-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-aichat-20-n.svg#icon"></use></svg>
          <span class="continue-session-body">
            <span class="continue-session-eyebrow">Continue your last session</span>
            <span class="continue-session-preview">${this.lastSession.preview}</span>
            ${lastActive ? html`<span class="continue-session-time">Last active ${lastActive}</span>` : nothing}
          </span>
        </button>
      ` : nothing}
      ${prompts.length ? html`
        <div class="prompt-cards">
          ${prompts.slice(0, 3).map((card) => html`
            <button class="prompt-card" @click=${() => this.onSend?.(card.prompt)}>
              <svg class="prompt-card-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-aichat-20-n.svg#icon"></use></svg>
              <span class="prompt-card-description">${card.description ?? card.title}</span>
            </button>
          `)}
                  ${prompts.length > 3 ? html`
          <button class="prompt-more" @click=${this._showMore}>Show more</button>
        ` : nothing}
        </div>

      ` : nothing}
    `;
  }
}

if (!customElements.get('nx-new-chat')) customElements.define('nx-new-chat', NxNewChat);

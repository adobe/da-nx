import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { DA_ORIGIN, daFetch } from '../../../utils/daFetch.js';
import { loadIms } from '../../../utils/ims.js';

const styles = await loadStyle(import.meta.url);

class NxChatWelcome extends LitElement {
  static properties = {
    context: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    loadIms().then(({ first_name: firstName, displayName }) => {
      this._firstName = firstName ?? displayName?.split(' ')[0];
      this.requestUpdate();
    });
  }

  willUpdate(changed) {
    if (changed.has('context')) this._loadPrompts(this.context);
  }

  _renderIcon(name) {
    const svg = this._icons?.[name] ?? this._icons?.all;
    return svg ? svg.cloneNode(true) : nothing;
  }

  async _loadPrompts({ org, site }) {
    if (!org || !site) return;
    const key = `${org}/${site}`;
    if (this._promptsKey === key) return;
    this._promptsKey = key;
    try {
      const resp = await daFetch(`${DA_ORIGIN}/config/${org}/${site}`);
      if (!resp.ok) return;
      const json = await resp.json();
      this._promptCards = (json?.prompts?.data ?? []).filter((r) => r.title && r.prompt);
      this.requestUpdate();
    } catch { /* silent */ }
  }

  render() {
    const greeting = `Welcome${this._firstName ? `, ${this._firstName}` : ''}`;
    const view = this.context?.view;

    const filtered = (this._promptCards ?? []).filter((c) => !c.area || c.area === 'all' || c.area === view);

    return html`
      <div class="chat-welcome-message">
        <h3>${greeting}</h3>
        <p>What are we working on today?</p>
      </div>
      ${filtered.length ? html`
        <div class="prompt-cards">
          ${filtered.slice(0, 3).map((card) => html`
            <button class="prompt-card" @click=${() => this.onSend?.(card.prompt)}>
              <span class="prompt-card-description">${card.description}</span>
            </button>
          `)}
        </div>
        ${filtered.length > 3 ? html`
          <button class="prompt-more">Show more</button>
        ` : nothing}
      ` : nothing}
  `;
  }
}

customElements.define('nx-chat-welcome', NxChatWelcome);

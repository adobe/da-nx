import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadHrefSvg, ICONS_BASE } from '../../utils/svg.js';
import '../shared/picker/picker.js';

const style = await loadStyle(import.meta.url);
const closeIcon = await loadHrefSvg(`${ICONS_BASE}S2_Icon_SplitRight_20_N.svg`);

class NxToolPanel extends LitElement {
  static properties = {
    views: { attribute: false },
    activeId: { type: String },
  };

  _loaded = {};

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  async firstUpdated() {
    if (this.views?.length && !this.activeId) {
      await this._activate(this.views[0].id);
    }
  }

  async updated(changed) {
    if (changed.has('views') && this.views?.length && !this.activeId) {
      await this._activate(this.views[0].id);
    }
    if (changed.has('activeId')) {
      this._syncContent();
      this._syncHeaderActions();
    }
  }

  async _activate(id) {
    const consumer = this.views?.find((c) => c.id === id);
    if (!consumer) return;
    if (!this._loaded[id]) {
      this._loaded[id] = await consumer.load();
    }
    this.activeId = id;
  }

  _syncContent() {
    const content = this.shadowRoot.querySelector('.tool-panel-content');
    if (!content) return;
    Object.entries(this._loaded).forEach(([id, el]) => {
      el.hidden = id !== this.activeId;
      if (id === this.activeId && !content.contains(el)) content.append(el);
    });
  }

  _syncHeaderActions() {
    const zone = this.shadowRoot.querySelector('.tool-panel-header-actions');
    if (!zone) return;
    zone.textContent = '';
    const consumer = this.views?.find((c) => c.id === this.activeId);
    if (!consumer?.firstParty) return;
    const el = this._loaded[this.activeId];
    const actions = el?.getHeaderActions?.();
    if (actions) zone.append(actions);
  }

  _close() {
    this.dispatchEvent(new CustomEvent('nx-panel-close', { bubbles: true, composed: true }));
  }

  render() {
    const items = this.views?.map((c) => ({ value: c.id, label: c.label })) ?? [];

    return html`
      <div class="tool-panel-header">
        <button type="button" class="tool-panel-close" aria-label="Close panel" @click=${this._close}>
          ${closeIcon ?? nothing}
        </button>
        <nx-picker
          .items=${items}
          .value=${this.activeId}
          placement="below-start"
          @change=${(e) => this._activate(e.detail.value)}
        ></nx-picker>
        <div class="tool-panel-header-actions"></div>
      </div>
      <div class="tool-panel-content"></div>
    `;
  }
}

customElements.define('nx-tool-panel', NxToolPanel);

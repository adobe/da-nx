import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

class NxTabs extends LitElement {
  static properties = {
    items: { attribute: false },
    active: { type: String, reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  updated(changed) {
    if (changed.has('items') && this.items?.length && !this.active) {
      this.active = this.items[0].id;
    }
  }

  _select(id) {
    if (id === this.active) return;
    this.active = id;
    this.dispatchEvent(new CustomEvent('tab-change', {
      detail: { id },
      bubbles: true,
      composed: true,
    }));
  }

  _onKeydown(e) {
    const ids = this.items?.map((i) => i.id) ?? [];
    if (!ids.length) return;
    const curIdx = ids.indexOf(this.active);

    let nextIdx;
    if (e.key === 'ArrowRight') {
      nextIdx = (curIdx + 1) % ids.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (curIdx <= 0 ? ids.length : curIdx) - 1;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = ids.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    this._select(ids[nextIdx]);
    this.updateComplete.then(() => {
      this.shadowRoot.querySelector(`[data-id="${ids[nextIdx]}"]`)?.focus();
    });
  }

  render() {
    if (!this.items?.length) return nothing;

    return html`
      <div class="tabs" role="tablist" @keydown=${this._onKeydown}>
        ${this.items.map((item) => html`
          <button
            role="tab"
            part="tab"
            type="button"
            class="tab ${item.id === this.active ? 'is-active' : ''}"
            data-id=${item.id}
            aria-selected=${item.id === this.active ? 'true' : 'false'}
            tabindex=${item.id === this.active ? '0' : '-1'}
            @click=${() => this._select(item.id)}
          >${item.label}</button>
        `)}
      </div>
    `;
  }
}

customElements.define('nx-tabs', NxTabs);

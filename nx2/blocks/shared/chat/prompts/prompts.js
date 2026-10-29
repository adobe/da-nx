import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../utils/utils.js';
import '../../picker/picker.js';
import '../../search/search.js';

const styles = await loadStyle(import.meta.url);

const ALL_CATEGORY = 'all';

class NxPrompts extends LitElement {
  static properties = {
    prompts: { attribute: false },
    _search: { state: true },
    _category: { state: true },
  };

  constructor() {
    super();
    this._search = '';
    this._category = ALL_CATEGORY;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  willUpdate(changed) {
    if (changed.has('prompts')) {
      const seen = new Set();
      this._categories = [
        { value: ALL_CATEGORY, label: 'All' },
        ...(this.prompts ?? [])
          .map((p) => p.category)
          .filter((c) => c && c !== ALL_CATEGORY && !seen.has(c) && seen.add(c))
          .map((c) => ({ value: c, label: c })),
      ];
    }
  }

  get _filtered() {
    const search = this._search.toLowerCase();
    return (this.prompts ?? []).filter((p) => {
      if (this._category !== ALL_CATEGORY && p.category !== this._category) return false;
      if (!search) return true;
      return p.title?.toLowerCase().includes(search)
        || p.description?.toLowerCase().includes(search);
    });
  }

  _onListKeydown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...this.shadowRoot.querySelectorAll('.prompt-item')];
    if (!items.length) return;
    e.preventDefault();
    const cur = items.indexOf(e.target);
    const next = e.key === 'ArrowDown'
      ? items[(cur + 1) % items.length]
      : items[(cur <= 0 ? items.length : cur) - 1];
    next.focus({ preventScroll: true });
  }

  _onSearch(e) {
    this._search = e.target.value;
  }

  _onCategoryChange(e) {
    this._category = e.detail.value;
  }

  focus() {
    this.shadowRoot.querySelector('nx-search')?.focus();
  }

  render() {
    const total = this.prompts?.length ?? 0;
    const filtered = this._filtered;
    const placeholder = this._category === ALL_CATEGORY
      ? `Search all ${total} prompts`
      : `Search in ${this._category}`;
    return html`
      <div class="prompts-header">
        <nx-search variant="quiet" size="m"
          label=${placeholder}
          placeholder=${placeholder}
          .value=${this._search}
          @input=${this._onSearch}
        ></nx-search>
        <nx-picker
          size="m"
          .items=${this._categories}
          .value=${this._category}
          placement="below-end"
          @change=${this._onCategoryChange}
        ></nx-picker>
      </div>
      <ul class="prompts-list" @keydown=${this._onListKeydown}>
        ${filtered.map((p) => html`
          <li>
            <button class="prompt-item" type="button" @click=${() => this.onSend?.(p.prompt)}>
              <div class="prompt-item-header">
                <span class="prompt-item-title">${p.title}</span>
                ${p.category ? html`<span class="prompt-item-category">${p.category}</span>` : nothing}
              </div>
              ${p.description ? html`<span class="prompt-item-desc">${p.description}</span>` : nothing}
            </button>
          </li>
        `)}
        ${total && !filtered.length ? html`<p class="prompts-empty">No prompts match your search.</p>` : nothing}
      </ul>
    `;
  }
}

if (!customElements.get('nx-prompts')) customElements.define('nx-prompts', NxPrompts);

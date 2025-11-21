import { html, LitElement } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import '../../../../public/sl/components.js';
import { generateTagSuggestions } from '../../utils/tags.js';

const styles = await getStyle(import.meta.url);
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const slComponents = await getStyle(`${nx}/public/sl/components.css`);

const ICONS = [
  `${nx}/public/icons/S2_Icon_Close_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Checkmark_20_N.svg`,
  `${nx}/public/icons/S2_Icon_Tag_20_N.svg`,
];

class NxTagModal extends LitElement {
  static properties = {
    isOpen: { attribute: false },
    selectedMedia: { attribute: false },
    tagConfig: { attribute: false },
    _tagInput: { state: true },
    _selectedTags: { state: true },
    _tagSuggestions: { state: true },
    _tagMode: { state: true },
  };

  constructor() {
    super();
    this.isOpen = false;
    this.selectedMedia = [];
    this.tagConfig = null;
    this._tagInput = '';
    this._selectedTags = [];
    this._tagSuggestions = [];
    this._tagMode = 'append';
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, slComponents, styles];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    document.addEventListener('keydown', this.handleKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  handleKeyDown(e) {
    if (this.isOpen && e.key === 'Escape') {
      e.preventDefault();
      this.handleClose();
    }
  }

  handleClose() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  handleTagInputChange(e) {
    this._tagInput = e.target.value;
    if (this._tagInput && this.tagConfig) {
      this._tagSuggestions = generateTagSuggestions(this.tagConfig.taxonomy, this._tagInput);
    } else {
      this._tagSuggestions = [];
    }
  }

  handleTagInputKeyDown(e) {
    if (e.key === 'Enter' && this._tagInput.trim()) {
      e.preventDefault();
      this.addTag(this._tagInput.trim());
    }
  }

  handleTagSuggestionClick(tag) {
    this.addTag(tag);
  }

  addTag(tag) {
    if (!this._selectedTags.includes(tag)) {
      this._selectedTags = [...this._selectedTags, tag];
    }
    this._tagInput = '';
    this._tagSuggestions = [];
  }

  removeTag(tag) {
    this._selectedTags = this._selectedTags.filter((t) => t !== tag);
  }

  handleApply() {
    if (this._selectedTags.length === 0) return;

    this.dispatchEvent(new CustomEvent('apply', {
      detail: {
        tags: this._selectedTags,
        mode: this._tagMode,
      },
    }));

    this._tagInput = '';
    this._selectedTags = [];
    this._tagSuggestions = [];
  }

  handleCancel() {
    this._tagInput = '';
    this._selectedTags = [];
    this._tagSuggestions = [];
    // Dispatch event to exit tagging mode
    window.dispatchEvent(new CustomEvent('tag-cancel'));
    this.handleClose();
  }

  render() {
    if (!this.isOpen) return '';

    const mediaCount = this.selectedMedia.length;

    return html`
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-body">
            <div class="tag-input-section">
              <sl-input
                type="text"
                placeholder="Search tags..."
                .value=${this._tagInput}
                @input=${this.handleTagInputChange}
                @keydown=${this.handleTagInputKeyDown}
                size="small"
                class="tag-input"
              ></sl-input>
            </div>

            <div class="tag-mode-section">
              <select
                .value=${this._tagMode}
                @change=${(e) => { this._tagMode = e.target.value; }}
                class="tag-mode-select"
              >
                <option value="append">Add</option>
                <option value="replace">Replace</option>
              </select>
            </div>

            ${this._selectedTags.length > 0 ? html`
              <div class="selected-tags-section">
                <div class="selected-tags-chips">
                  ${this._selectedTags.map((tag) => {
    const parts = tag.split('/');
    const leafName = parts[parts.length - 1];
    return html`
                      <span class="tag-chip" title="${tag}">
                        ${leafName}
                        <button
                          type="button"
                          class="tag-remove"
                          @click=${() => this.removeTag(tag)}
                          aria-label="Remove ${leafName}"
                        >×</button>
                      </span>
                    `;
  })}
                </div>
              </div>
            ` : ''}
          </div>

          <div class="modal-footer">
            <button
              type="button"
              class="modal-button primary"
              @click=${this.handleApply}
              ?disabled=${this._selectedTags.length === 0}
            >
              Apply
            </button>
            <button
              type="button"
              class="modal-button secondary"
              @click=${this.handleCancel}
            >
              <svg class="icon" viewBox="0 0 20 20">
                <use href="#S2_Icon_Close_20_N"></use>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      ${this._tagSuggestions.length > 0 ? html`
        <div class="tag-suggestions-wrapper">
          <div class="tag-suggestions">
            ${this._tagSuggestions.map((suggestion) => html`
              <button
                type="button"
                class="tag-suggestion"
                @click=${() => this.handleTagSuggestionClick(suggestion.value)}
              >
                <svg class="tag-icon" viewBox="0 0 20 20">
                  <use href="#S2_Icon_Tag_20_N"></use>
                </svg>
                ${suggestion.display}
                ${suggestion.parent ? html`<span class="tag-parent">${suggestion.parent}</span>` : ''}
              </button>
            `)}
          </div>
        </div>
      ` : ''}
    `;
  }
}

customElements.define('nx-tag-modal', NxTagModal);


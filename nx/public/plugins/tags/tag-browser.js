/* eslint-disable no-underscore-dangle, import/no-unresolved */
import { LitElement, html, nothing } from 'https://da.live/nx/deps/lit/lit-core.min.js';
import getStyle from 'https://da.live/nx/utils/styles.js';

const style = await getStyle(import.meta.url);

class DaTagBrowser extends LitElement {
  static properties = {
    rootTags: { type: Array },
    actions: { type: Object },
    getTags: { type: Function },
    tagValue: { type: String },
    _tags: { state: true },
    _activeTag: { state: true },
    _searchQuery: { state: true },
    _secondaryTags: { state: true },
  };

  constructor() {
    super();
    this._tags = [];
    this._activeTag = {};
    this._searchQuery = '';
    this._secondaryTags = false;
  }

  getTagSegments() {
    return (this._activeTag.activeTag ? this._activeTag.activeTag.split('/') : []).concat(this._activeTag.name);
  }

  getTagValue() {
    if (this.tagValue === 'title') return this._activeTag.title;
    const tagSegments = this.getTagSegments();
    return tagSegments.join(tagSegments.length > 2 ? '/' : ':').replace('/', ':');
  }

  handleBlur() {
    this._secondaryTags = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.addEventListener('blur', this.handleBlur, true);
  }

  disconnectedCallback() {
    this.removeEventListener('blur', this.handleBlur, true);
    super.disconnectedCallback();
  }

  updated(changedProperties) {
    if (changedProperties.has('rootTags')) {
      this._tags = [this.rootTags];
      this._activeTag = {};
    }

    if (changedProperties.has('_tags')) {
      setTimeout(() => {
        const groups = this.renderRoot.querySelector('.tag-groups');
        if (!groups) return;
        const firstTag = groups.lastElementChild?.querySelector('.tag-title');
        firstTag?.focus();
        groups.scrollTo({ left: groups.scrollWidth, behavior: 'smooth' });
      }, 100);
    }
  }

  async handleTagClick(tag, idx) {
    this._activeTag = tag;
    if (!this.getTags) return;
    const newTags = await this.getTags(tag);
    if (!newTags || newTags.length === 0) return;
    this._tags = [...this._tags.toSpliced(idx + 1), newTags];
  }

  handleTagInsert(tag) {
    this._activeTag = tag;
    const tagValue = this._secondaryTags ? `, ${this.getTagValue()}` : this.getTagValue();
    this.actions.sendText(tagValue);
    this._secondaryTags = true;
  }

  handleBackClick() {
    if (this._tags.length === 0) return;
    this._tags = this._tags.slice(0, -1);
    this._activeTag = this._tags[this._tags.length - 1]
      .find((tag) => this._activeTag.activeTag.includes(tag.name)) || {};
  }

  handleSearchInput(event) {
    this._searchQuery = event.target.value.toLowerCase();
  }

  filterTags(tags) {
    if (!this._searchQuery) return tags;
    return tags.filter((tag) => tag.title.toLowerCase().includes(this._searchQuery));
  }

  renderSearchBar() {
    return html`
      <section class="tag-search">
        <div class="search-details">
          <input 
            type="text" 
            placeholder="Search tags..." 
            @input=${this.handleSearchInput} 
            value=${this._searchQuery} 
          />
          ${(this._tags.length > 1) ? html`<button @click=${this.handleBackClick}>←</button>` : nothing}
        </div>
      </section>
    `;
  }

  renderTag(tag, idx) {
    const active = this.getTagSegments()[idx] === tag.name;
    return html`
      <li class="tag-group">
        <div class="tag-details">
          <button 
            class="tag-title ${active ? 'active' : ''}" 
            @click=${() => this.handleTagClick(tag, idx)}
            aria-pressed="${active}">
            ${tag.title.split('/').pop()}
          </button>
          <button 
            class="tag-insert"
            @click=${() => this.handleTagInsert(tag, idx)} 
            aria-label="Insert tag ${tag.title}">
            →
          </button>
        </div>
      </li>
    `;
  }

  renderTagGroup(group, idx) {
    const filteredGroup = this.filterTags(group);
    return html`
      <ul class="tag-group-list">
        ${filteredGroup.map((tag) => this.renderTag(tag, idx))}
      </ul>
    `;
  }

  render() {
    if (this._tags.length === 0) return nothing;
    return html`
      <div class="tag-browser">
        ${this.renderSearchBar()}
        <ul class="tag-groups">
          ${this._tags.map((group, idx) => html`
            <li class="tag-group-column">
              ${this.renderTagGroup(group, idx)}
            </li>
          `)}
        </ul>
      </div>
    `;
  }
}

customElements.define('da-tag-browser', DaTagBrowser);

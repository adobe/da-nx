// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';

const style = await getStyle(import.meta.url);

function toolbarIconEdit() {
  return html`<sp-icon-edit class="sl-browse-selection-icon" size="s"></sp-icon-edit>`;
}

function toolbarIconClose() {
  return html`
    <sp-icon-cross75
      class="sl-browse-selection-icon sl-browse-selection-clear-icon"
      size="xs"
    ></sp-icon-cross75>
  `;
}

function toolbarIconPlay() {
  return html`<sp-icon-play class="sl-browse-selection-icon" size="s"></sp-icon-play>`;
}

function toolbarIconPublish() {
  return html`<sp-icon-publish class="sl-browse-selection-icon" size="s"></sp-icon-publish>`;
}

function toolbarIconRename() {
  return html`<sp-icon-rename class="sl-browse-selection-icon" size="s"></sp-icon-rename>`;
}

function toolbarIconMove() {
  return html`<sp-icon-move class="sl-browse-selection-icon" size="s"></sp-icon-move>`;
}

function toolbarIconDelete() {
  return html`<sp-icon-delete class="sl-browse-selection-icon" size="s"></sp-icon-delete>`;
}

/**
 * Bulk actions for a multi-select file list (clear, preview/publish, rename, move, delete, edit).
 * Host decides which actions apply; this element only renders and re-dispatches intent events.
 * @fires sl-action-bar-close
 * @fires sl-file-request-preview
 * @fires sl-file-request-publish
 * @fires sl-file-request-rename
 * @fires sl-file-request-move
 * @fires sl-file-request-delete
 * @fires sl-file-request-edit
 * @customElement sl-browse-selection-toolbar
 */
export class SlBrowseSelectionToolbar extends LitElement {
  static properties = {
    /** Number of selected rows (drives label and rename visibility). */
    selectedCount: { type: Number, attribute: 'selected-count' },
    /** When true, show Preview / Publish (host decides, e.g. no folder-only selection + AEM). */
    showPublishActions: { type: Boolean, attribute: 'show-publish-actions' },
    publishLoading: { type: Boolean, attribute: 'publish-loading' },
    /** Host exposes rename API. */
    renameEnabled: { type: Boolean, attribute: 'rename-enabled' },
    renameLoading: { type: Boolean, attribute: 'rename-loading' },
    /** Host exposes delete API. */
    deleteEnabled: { type: Boolean, attribute: 'delete-enabled' },
    deleteLoading: { type: Boolean, attribute: 'delete-loading' },
    /** Emphasized Edit (e.g. single HTML file). */
    showEditAction: { type: Boolean, attribute: 'show-edit-action' },
    /** Bulk Move: host must handle `sl-file-request-move` when true. */
    moveEnabled: { type: Boolean, attribute: 'move-enabled' },
  };

  constructor() {
    super();
    this.selectedCount = 0;
    this.showPublishActions = false;
    this.publishLoading = false;
    this.renameEnabled = false;
    this.renameLoading = false;
    this.deleteEnabled = false;
    this.deleteLoading = false;
    this.showEditAction = false;
    this.moveEnabled = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  /**
   * Dispatches a bubbling custom event for the host shell.
   * @param {string} eventName - Event type to emit.
   */
  _emitIntent(eventName) {
    this.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true }));
  }

  render() {
    const count = this.selectedCount;
    const showRename = count === 1 && this.renameEnabled;
    return html`
      <div class="sl-browse-selection-toolbar" role="toolbar" aria-label="Selection actions">
        <sp-action-button
          size="s"
          quiet
          label="Clear selection"
          @click="${() => this._emitIntent('sl-action-bar-close')}"
        >
          <span slot="icon">${toolbarIconClose()}</span>
        </sp-action-button>
        <span class="sl-browse-selection-count">${count} selected</span>
        ${this.showPublishActions
          ? html`
              <sp-action-button
                size="s"
                quiet
                ?disabled="${this.publishLoading}"
                @click="${() => this._emitIntent('sl-file-request-preview')}"
              >
                <span slot="icon">${toolbarIconPlay()}</span>
                Preview
              </sp-action-button>
              <sp-action-button
                size="s"
                quiet
                ?disabled="${this.publishLoading}"
                @click="${() => this._emitIntent('sl-file-request-publish')}"
              >
                <span slot="icon">${toolbarIconPublish()}</span>
                Publish
              </sp-action-button>
            `
          : ''}
        ${showRename
          ? html`
              <sp-action-button
                size="s"
                quiet
                ?disabled="${this.renameLoading}"
                @click="${() => this._emitIntent('sl-file-request-rename')}"
              >
                <span slot="icon">${toolbarIconRename()}</span>
                Rename
              </sp-action-button>
            `
          : ''}
        <sp-action-button
          size="s"
          quiet
          label="Move"
          ?disabled="${!this.moveEnabled}"
          @click="${() => this.moveEnabled && this._emitIntent('sl-file-request-move')}"
        >
          <span slot="icon">${toolbarIconMove()}</span>
          Move
        </sp-action-button>
        ${this.deleteEnabled
          ? html`
              <sp-action-button
                size="s"
                quiet
                ?disabled="${this.deleteLoading}"
                @click="${() => this._emitIntent('sl-file-request-delete')}"
              >
                <span slot="icon">${toolbarIconDelete()}</span>
                Delete
              </sp-action-button>
            `
          : ''}
        ${this.showEditAction
          ? html`
              <sp-action-button
                size="s"
                emphasized
                @click="${() => this._emitIntent('sl-file-request-edit')}"
              >
                <span slot="icon">${toolbarIconEdit()}</span>
                Edit
              </sp-action-button>
            `
          : ''}
      </div>
    `;
  }
}

if (!customElements.get('sl-browse-selection-toolbar')) {
  customElements.define('sl-browse-selection-toolbar', SlBrowseSelectionToolbar);
}

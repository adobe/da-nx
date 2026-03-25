// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';

const style = await getStyle(import.meta.url);

function toolbarIconEdit() {
  return html`<sp-icon-edit slot="icon" class="sl-browse-selection-icon"></sp-icon-edit>`;
}

function toolbarIconPlay() {
  return html`<sp-icon-play slot="icon" class="sl-browse-selection-icon"></sp-icon-play>`;
}

function toolbarIconPublish() {
  return html`<sp-icon-publish slot="icon" class="sl-browse-selection-icon"></sp-icon-publish>`;
}

function toolbarIconRename() {
  return html`<sp-icon-rename slot="icon" class="sl-browse-selection-icon"></sp-icon-rename>`;
}

function toolbarIconDelete() {
  return html`<sp-icon-delete slot="icon" class="sl-browse-selection-icon"></sp-icon-delete>`;
}

/**
 * Bulk actions for a multi-select file list (clear, preview/publish, rename, delete, edit).
 * Host decides which actions apply; this element only renders and re-dispatches intent events.
 * @fires sl-action-bar-close - From Spectrum `sp-action-bar` clear (close) control.
 * @fires sl-file-request-preview
 * @fires sl-file-request-publish
 * @fires sl-file-request-rename
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
      <sp-theme
        class="sl-browse-selection-theme"
        system="spectrum-two"
        scale="medium"
        color="light"
      >
        <sp-action-bar
          class="sl-browse-selection-action-bar"
          open
          @close="${() => this._emitIntent('sl-action-bar-close')}"
        >
          ${count} selected
          ${this.showPublishActions
          ? html`
              <sp-action-button
                slot="buttons"
                quiet
                ?disabled="${this.publishLoading}"
                @click="${() => this._emitIntent('sl-file-request-preview')}"
              >
                ${toolbarIconPlay()}
                Preview
              </sp-action-button>
              <sp-action-button
                slot="buttons"
                quiet
                ?disabled="${this.publishLoading}"
                @click="${() => this._emitIntent('sl-file-request-publish')}"
              >
                ${toolbarIconPublish()}
                Publish
              </sp-action-button>
            `
          : ''}
        ${showRename
          ? html`
              <sp-action-button
                slot="buttons"
                quiet
                ?disabled="${this.renameLoading}"
                @click="${() => this._emitIntent('sl-file-request-rename')}"
              >
                ${toolbarIconRename()}
                Rename
              </sp-action-button>
            `
          : ''}
        ${this.deleteEnabled
          ? html`
              <sp-action-button
                slot="buttons"
                quiet
                ?disabled="${this.deleteLoading}"
                @click="${() => this._emitIntent('sl-file-request-delete')}"
              >
                ${toolbarIconDelete()}
                Delete
              </sp-action-button>
            `
          : ''}
        ${this.showEditAction
          ? html`
              <sp-action-button
                slot="buttons"
                emphasized
                @click="${() => this._emitIntent('sl-file-request-edit')}"
              >
                ${toolbarIconEdit()}
                Edit
              </sp-action-button>
            `
          : ''}
        </sp-action-bar>
      </sp-theme>
    `;
  }
}

if (!customElements.get('sl-browse-selection-toolbar')) {
  customElements.define('sl-browse-selection-toolbar', SlBrowseSelectionToolbar);
}

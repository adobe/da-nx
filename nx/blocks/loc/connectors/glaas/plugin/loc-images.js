import { html, LitElement } from 'da-lit';
import DA_SDK from '../../../../../utils/sdk.js';
import getStyle from '../../../../../utils/styles.js';
import {
  fetchPageHtml, buildImageRows, buildVideoRows, ensureThumbnailLogins,
  resolveAuthenticatedThumbnails, saveSelections,
} from './index.js';

const nx = `${new URL(import.meta.url).origin}/nx`;

const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

const cloneRows = (rows) => rows.map((row) => ({ ...row }));
const countSelected = (rows) => rows.filter((row) => row.checked).length;

class NxGlaasLocImages extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    path: { attribute: false },
    token: { attribute: false },
    _rows: { state: true },
    _initialRows: { state: true },
    _videoRows: { state: true },
    _initialVideoRows: { state: true },
    _status: { state: true },
    _saving: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
    this.setup();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._rows?.forEach((row) => {
      if (row.thumbnail?.startsWith('blob:')) URL.revokeObjectURL(row.thumbnail);
    });
  }

  async setup() {
    const {
      org, site, path, token,
    } = this;
    try {
      const pageHtml = await fetchPageHtml({
        org, site, path, token,
      });
      if (pageHtml === null) {
        this._status = { text: 'Could not load this page.', type: 'error' };
        return;
      }
      const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
      const rows = buildImageRows(doc);
      const videoRows = buildVideoRows(doc);
      await Promise.all([
        ensureThumbnailLogins(rows, token),
        resolveAuthenticatedThumbnails(rows, token),
      ]);
      this._rows = rows;
      this._initialRows = cloneRows(rows);
      this._videoRows = videoRows;
      this._initialVideoRows = cloneRows(videoRows);
    } catch {
      this._status = { text: 'Could not load this page.', type: 'error' };
    }
  }

  handleToggle(row) {
    row.checked = !row.checked;
    this.requestUpdate();
  }

  async handleSave() {
    this._saving = true;
    this._status = undefined;
    try {
      const result = await saveSelections({
        org: this.org,
        site: this.site,
        path: this.path,
        token: this.token,
        initialRows: this._initialRows,
        currentRows: this._rows,
        initialVideoRows: this._initialVideoRows,
        currentVideoRows: this._videoRows,
      });
      if (result.error || !result.ok) {
        this._status = { text: 'Could not save your selection.', type: 'error' };
        return;
      }
      this._initialRows = cloneRows(this._rows);
      this._initialVideoRows = cloneRows(this._videoRows);
      this._status = { text: 'Saved.', type: 'success' };
    } catch {
      this._status = { text: 'Could not save your selection.', type: 'error' };
    } finally {
      this._saving = false;
    }
  }

  renderCheckbox({ row, label, disabled = false }) {
    return html`
      <input
        type="checkbox"
        aria-label=${label}
        .checked=${row.checked}
        ?disabled=${this._saving || disabled}
        @change=${() => this.handleToggle(row)} />
    `;
  }

  renderRow(row) {
    return html`
      <li class="row ${row.eligible ? '' : 'is-ineligible'}">
        ${this.renderCheckbox({
          row,
          label: `Translate image: ${row.alt || row.src}`,
          disabled: !row.eligible,
        })}
        <img class="thumb" src=${row.thumbnail} alt="" loading="lazy" />
        <div class="row-details">
          <p class="row-alt">${row.alt || row.src}</p>
          ${row.eligible ? null : html`<p class="row-note">${row.ineligibleReason}</p>`}
        </div>
      </li>
    `;
  }

  renderVideoRow(row) {
    return html`
      <li class="row">
        ${this.renderCheckbox({ row, label: `Translate video captions: ${row.src}` })}
        <span class="thumb video-thumb" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7Z"></path></svg>
        </span>
        <div class="row-details">
          <p class="row-alt"><a href=${row.src} target="_blank" rel="noopener noreferrer">${row.src}</a></p>
          <p class="row-note">Translate captions</p>
        </div>
      </li>
    `;
  }

  renderMessage() {
    if (!this._status) return null;
    return html`<p class="status status-${this._status.type}">${this._status.text}</p>`;
  }

  render() {
    if (!this._rows || !this._videoRows) {
      return this._status ? this.renderMessage() : html`<p>Loading images and videos…</p>`;
    }
    if (!this._rows.length && !this._videoRows.length) {
      return html`<p>No images or supported videos found on this page.</p>`;
    }

    return html`
      <div class="loc-images">
        <h2>Images</h2>
        <p class="summary">${countSelected(this._rows)} of ${this._rows.length} images already marked for translation.</p>
        <ul class="row-list image-list">
          ${this._rows.map((row) => this.renderRow(row))}
        </ul>
        <h2>Videos</h2>
        <p class="summary">${countSelected(this._videoRows)} of ${this._videoRows.length} videos marked for caption translation.</p>
        <ul class="row-list video-list">
          ${this._videoRows.map((row) => this.renderVideoRow(row))}
        </ul>
        <div class="actions">
          ${this.renderMessage()}
          <button class="save-btn" ?disabled=${this._saving} @click=${this.handleSave}>
            ${this._saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-glaas-loc-images', NxGlaasLocImages);

(async function init() {
  const { context, token, actions } = await DA_SDK;

  const panel = document.createElement('nx-glaas-loc-images');
  panel.org = context.org;
  panel.site = context.repo;
  panel.path = context.path;
  panel.token = token;
  panel.actions = actions;

  document.body.append(panel);
}());

import { html, LitElement } from 'da-lit';
import DA_SDK from '../../../../../utils/sdk.js';
import getStyle from '../../../../../utils/styles.js';
import {
  fetchPageHtml, buildImageRows, ensureThumbnailLogins, resolveAuthenticatedThumbnails,
  saveSelections,
} from './index.js';

const nx = `${new URL(import.meta.url).origin}/nx`;

const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

const cloneRows = (rows) => rows.map((row) => ({ ...row }));

class NxGlaasLocImages extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    path: { attribute: false },
    token: { attribute: false },
    _rows: { state: true },
    _initialRows: { state: true },
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
    const pageHtml = await fetchPageHtml({ org, site, path, token });
    if (pageHtml === null) {
      this._status = { text: 'Could not load this page.', type: 'error' };
      return;
    }
    const rows = buildImageRows(pageHtml);
    await Promise.all([
      ensureThumbnailLogins(rows, token),
      resolveAuthenticatedThumbnails(rows, token),
    ]);
    this._rows = rows;
    this._initialRows = cloneRows(rows);
  }

  handleToggle(row) {
    row.checked = !row.checked;
    this._rows = [...this._rows];
  }

  async handleSave() {
    this._saving = true;
    this._status = undefined;
    const result = await saveSelections({
      org: this.org,
      site: this.site,
      path: this.path,
      token: this.token,
      initialRows: this._initialRows,
      currentRows: this._rows,
    });
    this._saving = false;
    if (result.error || !result.ok) {
      this._status = { text: 'Could not save your selection.', type: 'error' };
      return;
    }
    this._initialRows = cloneRows(this._rows);
    this._status = { text: 'Saved.', type: 'success' };
  }

  get _markedCount() {
    return this._rows?.filter((row) => row.checked).length ?? 0;
  }

  renderRow(row) {
    return html`
      <li class="row ${row.eligible ? '' : 'is-ineligible'}">
        <input
          type="checkbox"
          .checked=${row.checked}
          ?disabled=${!row.eligible}
          @change=${() => this.handleToggle(row)} />
        <img class="thumb" src=${row.thumbnail} alt="" loading="lazy" />
        <div class="row-details">
          <p class="row-alt">${row.alt || row.src}</p>
          ${row.eligible ? null : html`<p class="row-note">Not eligible for image translation (svg, or not an absolute http(s) URL).</p>`}
        </div>
      </li>
    `;
  }

  renderMessage() {
    if (!this._status) return null;
    return html`<p class="status status-${this._status.type}">${this._status.text}</p>`;
  }

  render() {
    if (!this._rows) return html`<p>Loading images…</p>`;
    if (!this._rows.length) return html`<p>No images found on this page.</p>`;

    return html`
      <div class="loc-images">
        <p class="summary">${this._markedCount} of ${this._rows.length} images already marked for translation.</p>
        <ul class="row-list">
          ${this._rows.map((row) => this.renderRow(row))}
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

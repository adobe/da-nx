/**
 * File history panel: shows version list for the selected file (e.g. .html).
 * Fetches from DA versionlist API; display only (no restore or create).
 */
// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';
import { daFetch } from '../../../utils/daFetch.js';

const style = await getStyle(import.meta.url);

const DA_ORIGIN = 'https://admin.da.live';

function formatDate(timestamp) {
  const rawDate = timestamp ? new Date(timestamp) : new Date();
  const date = rawDate.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  const time = rawDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return { date, time };
}

function formatVersions(json) {
  if (!Array.isArray(json)) return [];
  const sorted = [...json].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const ungrouped = sorted.map((entry) => {
    const { date, time } = formatDate(entry.timestamp);
    return {
      date,
      time,
      ...entry,
      isVersion: !!entry.url,
    };
  });
  return ungrouped.reduce((acc, entry) => {
    if (entry.isVersion) {
      acc.push(entry);
    } else {
      const existing = acc.find((e) => !e.isVersion && e.date === entry.date);
      if (!existing) {
        acc.push({ date: entry.date, audits: [entry] });
      } else {
        existing.audits.push(entry);
      }
    }
    return acc;
  }, []);
}

export default class FileHistory extends LitElement {
  static properties = {
    path: { type: String },
    _versions: { state: true },
    _loading: { state: true },
  };

  constructor() {
    super();
    this.path = '';
    this._versions = null;
    this._loading = false;
  }

  async getVersions() {
    const path = (this.path || '').replace(/^\//, '').trim();
    if (!path) {
      this._versions = [];
      this._loading = false;
      return;
    }
    const apiPath = path.startsWith('/') ? path : `/${path}`;
    this._loading = true;
    this._versions = null;
    try {
      const resp = await daFetch(`${DA_ORIGIN}/versionlist${apiPath}`);
      if (!resp.ok) {
        this._versions = [];
        return;
      }
      const json = await resp.json();
      this._versions = formatVersions(json);
    } catch {
      this._versions = [];
    } finally {
      this._loading = false;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated(changed) {
    super.updated?.(changed);
    if (changed.has('path')) {
      this.getVersions();
    }
  }

  /* eslint-disable-next-line class-methods-use-this */
  renderEntry(entry) {
    if (entry.isVersion) {
      const users = (entry.users || []).map((u) => u?.email || u).filter(Boolean);
      return html`
        <li class="file-history-entry is-version">
          <p class="file-history-date">${entry.date} · ${entry.time}</p>
          ${entry.label ? html`<p class="file-history-meta">${entry.label}</p>` : nothing}
          ${users.length ? html`<p class="file-history-meta">${users.join(', ')}</p>` : nothing}
        </li>
      `;
    }
    const audits = entry.audits || [];
    return html`
      <li class="file-history-entry">
        <p class="file-history-date">${entry.date}</p>
        ${audits.map((au) => html`
          <p class="file-history-meta">${au.time}${(au.users || []).length ? ` · ${(au.users || []).map((u) => u?.email || u).join(', ')}` : ''}</p>
        `)}
      </li>
    `;
  }

  render() {
    const loading = this._loading;
    const versions = this._versions;
    const hasPath = (this.path || '').replace(/^\//, '').trim().length > 0;

    if (!hasPath) {
      return html`
        <div class="file-history">
          <p class="file-history-header">History</p>
          <div class="file-history-empty">Select a file to view history.</div>
        </div>
      `;
    }

    let listContent;
    if (loading) {
      listContent = html`
        <div class="file-history-loading">
          <sp-progress-circle indeterminate size="s" aria-label="Loading history"></sp-progress-circle>
          <span>Loading…</span>
        </div>
      `;
    } else if (versions?.length) {
      listContent = html`
        <ul class="file-history-list">
          ${versions.map((entry) => this.renderEntry(entry))}
        </ul>
      `;
    } else {
      listContent = html`<div class="file-history-empty">No history for this file.</div>`;
    }

    return html`
      <div class="file-history">
        <p class="file-history-header">History</p>
        <div class="file-history-list-wrap">
          ${listContent}
        </div>
      </div>
    `;
  }
}

customElements.define('da-file-history', FileHistory);

import { LitElement, html, nothing } from 'da-lit';
// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
import {
  loadGeneratedTools,
  approveGeneratedTool,
  deprecateGeneratedTool,
  deleteGeneratedTool,
} from './utils.js';

const style = await getStyle(import.meta.url);

/**
 * Generated Tools panel for the DA Skills Lab.
 *
 * Normal usage (reads/writes from DA config):
 *   <nx-generated-tools org="my-org" site="my-site"></nx-generated-tools>
 *
 * Demo / PoC usage (static data, no DA API, with live execution):
 *   const el = document.createElement('nx-generated-tools');
 *   el.staticTools = [ ...defs ];
 *   el.executors = { 'tool-id': async (args) => ({ result }) };
 *   document.body.appendChild(el);
 *
 * Emits `da-tool-approved` / `da-tool-rejected` for parent orchestration.
 */
class NXGeneratedTools extends LitElement {
  static properties = {
    org: { type: String },
    site: { type: String },
    _tools: { state: true },
    _busy: { state: true },
    _error: { state: true },
    _expandedId: { state: true },
    _tryId: { state: true },
    _runResult: { state: true },
    _runBusy: { state: true },
  };

  /**
   * Optional array of tool definitions. When set, skips DA API entirely.
   * @type {GeneratedToolDef[] | undefined}
   */
  staticTools = undefined;

  /**
   * Optional map of executor functions keyed by tool id.
   * When present, approved tools show a "Try it" panel.
   * @type {Record<string, (args: Record<string, unknown>) => Promise<unknown>> | undefined}
   */
  executors = undefined;

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  firstUpdated() {
    if (this.staticTools) {
      this._tools = [...this.staticTools];
    } else {
      this._loadTools();
    }
  }

  updated(changed) {
    if ((changed.has('org') || changed.has('site')) && this.org && !this.staticTools) {
      this._tools = undefined;
      this._loadTools();
    }
  }

  get _prefix() {
    return this.site ? `/${this.org}/${this.site}` : `/${this.org}`;
  }

  async _loadTools() {
    if (!this.org) return;
    const tools = await loadGeneratedTools(this.org, this.site);
    this._tools = tools;
  }

  async _approve(def) {
    this._busy = def.id;
    if (this.staticTools) {
      await new Promise((resolve) => { setTimeout(resolve, 400); });
      this._tools = this._tools.map((t) => (t.id === def.id
        ? { ...t, status: 'approved', approvedBy: 'you', approvedAt: new Date().toISOString() }
        : t));
      this._busy = undefined;
      this._expandedId = def.id;
      this.dispatchEvent(new CustomEvent('da-tool-approved', { detail: { id: def.id }, bubbles: true }));
      return;
    }
    const result = await approveGeneratedTool(this._prefix, def, 'user');
    this._busy = undefined;
    if (result.error) {
      this._error = result.error;
      return;
    }
    this._tools = this._tools.map((t) => (t.id === def.id ? { ...t, status: 'approved', approvedBy: 'user' } : t));
    this.dispatchEvent(new CustomEvent('da-tool-approved', { detail: { id: def.id }, bubbles: true }));
  }

  async _reject(def) {
    this._busy = def.id;
    if (this.staticTools) {
      await new Promise((resolve) => { setTimeout(resolve, 300); });
      this._tools = this._tools.map((t) => (t.id === def.id ? { ...t, status: 'deprecated' } : t));
      this._busy = undefined;
      return;
    }
    const result = await deprecateGeneratedTool(this._prefix, def);
    this._busy = undefined;
    if (result.error) {
      this._error = result.error;
      return;
    }
    this._tools = this._tools.map((t) => (t.id === def.id ? { ...t, status: 'deprecated' } : t));
    this.dispatchEvent(new CustomEvent('da-tool-rejected', { detail: { id: def.id }, bubbles: true }));
  }

  async _delete(def) {
    this._busy = def.id;
    if (this.staticTools) {
      await new Promise((resolve) => { setTimeout(resolve, 300); });
      this._tools = this._tools.filter((t) => t.id !== def.id);
      this._busy = undefined;
      return;
    }
    const result = await deleteGeneratedTool(this._prefix, def.id);
    this._busy = undefined;
    if (result.error) {
      this._error = result.error;
      return;
    }
    this._tools = this._tools.filter((t) => t.id !== def.id);
  }

  _toggleExpand(id) {
    this._expandedId = this._expandedId === id ? undefined : id;
    if (this._tryId === id) this._tryId = undefined;
  }

  _toggleTry(id) {
    this._tryId = this._tryId === id ? undefined : id;
    this._runResult = undefined;
  }

  async _runTool(def) {
    const executor = this.executors?.[def.id];
    if (!executor) return;

    this._runBusy = def.id;
    this._runResult = undefined;

    const inputEl = this.shadowRoot.querySelector(`#gt-try-input-${def.id}`);
    const raw = inputEl?.value ?? '';

    try {
      const args = { html: raw, text: raw, content: raw };
      const result = await executor(args);
      this._runResult = { id: def.id, data: result, error: null };
    } catch (e) {
      this._runResult = { id: def.id, data: null, error: e.message ?? String(e) };
    }
    this._runBusy = undefined;
  }

  _renderSchema(schema) {
    if (!schema?.properties) return nothing;
    const props = Object.entries(schema.properties);
    if (!props.length) return nothing;
    return html`
      <ul class="gt-schema-list">
        ${props.map(([name, def]) => html`
          <li><code>${name}</code>${def.description ? html` — ${def.description}` : nothing}</li>
        `)}
      </ul>`;
  }

  _renderResult(def) {
    if (!this._runResult || this._runResult.id !== def.id) return nothing;
    const { data, error } = this._runResult;
    if (error) {
      return html`<div class="gt-result gt-result-error" role="alert">${error}</div>`;
    }
    return html`<div class="gt-result" role="status"><pre>${JSON.stringify(data, null, 2)}</pre></div>`;
  }

  _renderTryPanel(def) {
    if (!this.executors?.[def.id]) return nothing;
    if (this._tryId !== def.id) {
      return html`
        <button class="gt-btn gt-btn-try" @click=${() => this._toggleTry(def.id)}>
          Try it ▶
        </button>`;
    }
    const busy = this._runBusy === def.id;
    const placeholder = def.id === 'validate-headings'
      ? '<h1>Title</h1>\n<h2>Section</h2>\n<h4>Skipped level!</h4>'
      : '<h1>Your page title</h1>\n<p>Paste HTML content here to analyse it.</p>';
    return html`
      <div class="gt-try-panel">
        <label class="gt-try-label" for="gt-try-input-${def.id}">Paste HTML to test:</label>
        <textarea
          id="gt-try-input-${def.id}"
          class="gt-try-input"
          rows="6"
          placeholder="${placeholder}"></textarea>
        <div class="gt-try-actions">
          <button class="gt-btn gt-btn-approve" ?disabled=${busy} @click=${() => this._runTool(def)}>
            ${busy ? 'Running…' : 'Run'}
          </button>
          <button class="gt-btn gt-btn-reject" @click=${() => this._toggleTry(def.id)}>Close</button>
        </div>
        ${this._renderResult(def)}
      </div>`;
  }

  _renderActions(def) {
    const busy = this._busy === def.id;
    if (def.status === 'draft') {
      return html`
        <div class="gt-actions">
          <button class="gt-btn gt-btn-approve" ?disabled=${busy}
            aria-label="Approve ${def.name}" @click=${() => this._approve(def)}>
            ${busy ? 'Approving…' : 'Approve'}
          </button>
          <button class="gt-btn gt-btn-reject" ?disabled=${busy}
            aria-label="Reject ${def.name}" @click=${() => this._reject(def)}>
            Reject
          </button>
        </div>`;
    }
    if (def.status === 'approved') {
      return html`
        <div class="gt-actions">
          <button class="gt-btn gt-btn-danger" ?disabled=${busy}
            aria-label="Delete ${def.name}" @click=${() => this._delete(def)}>
            ${busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>`;
    }
    return html`
      <div class="gt-actions">
        <button class="gt-btn gt-btn-danger" ?disabled=${busy}
          aria-label="Remove ${def.name}" @click=${() => this._delete(def)}>
          ${busy ? 'Removing…' : 'Remove'}
        </button>
      </div>`;
  }

  _renderToolCard(def) {
    const isExpanded = this._expandedId === def.id;
    return html`
      <div class="gt-card gt-card-${def.status}">
        <div class="gt-card-header">
          <button class="gt-card-toggle"
            aria-expanded=${isExpanded}
            aria-controls="gt-detail-${def.id}"
            @click=${() => this._toggleExpand(def.id)}>
            <span class="gt-card-name">${def.name}</span>
            <span class="gt-badge gt-badge-${def.status}">${def.status}</span>
            <span class="gt-card-arrow" aria-hidden="true">${isExpanded ? '▲' : '▼'}</span>
          </button>
          ${this._renderActions(def)}
        </div>
        ${isExpanded ? html`
          <div class="gt-card-detail" id="gt-detail-${def.id}">
            <p class="gt-desc">${def.description}</p>
            ${def.capability ? html`<div class="gt-meta">Capability: <code>${def.capability}</code></div>` : nothing}
            ${def.createdBy ? html`<div class="gt-meta">Created by: <code>${def.createdBy}</code></div>` : nothing}
            ${def.approvedBy ? html`<div class="gt-meta">Approved by: <code>${def.approvedBy}</code></div>` : nothing}
            <div class="gt-meta">Input parameters:</div>
            ${this._renderSchema(def.inputSchema)}
            ${def.status === 'approved' ? this._renderTryPanel(def) : nothing}
          </div>
        ` : nothing}
      </div>`;
  }

  render() {
    if (!this._tools) {
      return html`<div class="gt-loading" aria-busy="true">Loading generated tools…</div>`;
    }

    const drafts = this._tools.filter((t) => t.status === 'draft');
    const approved = this._tools.filter((t) => t.status === 'approved');
    const deprecated = this._tools.filter((t) => t.status === 'deprecated');

    return html`
      <div class="gt-panel">
        ${this._error ? html`<div class="gt-error" role="alert">${this._error}</div>` : nothing}

        <section class="gt-section" aria-label="Proposals">
          <h3 class="gt-section-title">Proposals <span class="gt-count">${drafts.length}</span></h3>
          ${drafts.length === 0
            ? html`<p class="gt-empty">No pending proposals. The assistant will suggest tools here when it encounters a task that doesn't match existing tools.</p>`
            : drafts.map((def) => this._renderToolCard(def))}
        </section>

        <section class="gt-section" aria-label="Approved tools">
          <h3 class="gt-section-title">Approved <span class="gt-count">${approved.length}</span></h3>
          ${approved.length === 0
            ? html`<p class="gt-empty">No approved tools yet. Approve a proposal above to make it available in chat.</p>`
            : approved.map((def) => this._renderToolCard(def))}
        </section>

        ${deprecated.length > 0 ? html`
          <section class="gt-section gt-section-deprecated" aria-label="Deprecated tools">
            <h3 class="gt-section-title">Deprecated <span class="gt-count">${deprecated.length}</span></h3>
            ${deprecated.map((def) => this._renderToolCard(def))}
          </section>
        ` : nothing}
      </div>`;
  }
}

customElements.define('nx-generated-tools', NXGeneratedTools);

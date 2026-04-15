import { LitElement, html, nothing } from 'da-lit';
// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
import {
  findBestGeneratedTool,
  loadGeneratedTools,
  approveGeneratedTool,
  deprecateGeneratedTool,
  deleteGeneratedTool,
} from './utils.js';
import { runGeneratedToolInWorker } from './client-executor.js';

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
    approvedBy: { type: String, attribute: 'approved-by' },
    _tools: { state: true },
    _busy: { state: true },
    _error: { state: true },
    _expandedId: { state: true },
    _tryId: { state: true },
    _runResult: { state: true },
    _runBusy: { state: true },
    _matchQuery: { state: true },
    _matchInput: { state: true },
    _matchResult: { state: true },
    _matchRunBusy: { state: true },
    _matchRunResult: { state: true },
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

  constructor() {
    super();
    this.approvedBy = 'user';
    this._tools = undefined;
    this._busy = undefined;
    this._error = '';
    this._expandedId = undefined;
    this._tryId = undefined;
    this._runResult = undefined;
    this._runBusy = undefined;
    this._matchQuery = '';
    this._matchInput = '';
    this._matchResult = null;
    this._matchRunBusy = false;
    this._matchRunResult = undefined;
  }

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

  async _loadTools() {
    if (!this.org) return;
    try {
      this._tools = await loadGeneratedTools(this.org, this.site);
    } catch {
      this._tools = [];
    }
  }

  async _approve(def) {
    this._busy = def.id;
    const approver = this.approvedBy || 'user';
    if (this.staticTools) {
      await new Promise((resolve) => { setTimeout(resolve, 400); });
      this._tools = this._tools.map((t) => (t.id === def.id
        ? { ...t, status: 'approved', approvedBy: approver, approvedAt: new Date().toISOString() }
        : t));
      this._busy = undefined;
      this._expandedId = def.id;
      this.dispatchEvent(new CustomEvent('da-tool-approved', { detail: { id: def.id }, bubbles: true }));
      return;
    }
    const result = await approveGeneratedTool(this.org, this.site, def, approver);
    this._busy = undefined;
    if (result.error) {
      this._error = result.error;
      return;
    }
    this._tools = this._tools.map((t) => (t.id === def.id ? {
      ...t,
      status: 'approved',
      approvedBy: approver,
      approvedAt: new Date().toISOString(),
    } : t));
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
    const result = await deprecateGeneratedTool(this.org, this.site, def);
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
    const result = await deleteGeneratedTool(this.org, this.site, def.id);
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

  _getExecutor(def) {
    return this.executors?.[def.id]
      || (def?.implementation?.type === 'web-worker'
        ? (args) => runGeneratedToolInWorker(def, args)
        : null);
  }

  async _runTool(def) {
    const executor = this._getExecutor(def);
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

  _findMatch() {
    const query = this._matchQuery.trim();
    this._matchRunResult = undefined;
    this._matchResult = query ? findBestGeneratedTool(query, this._tools || []) : null;
  }

  async _runMatchedTool() {
    const match = this._matchResult;
    if (!match?.tool) return;
    const executor = this._getExecutor(match.tool);
    if (!executor) return;

    this._matchRunBusy = true;
    this._matchRunResult = undefined;
    try {
      const args = {
        html: this._matchInput,
        text: this._matchInput,
        content: this._matchInput,
      };
      const result = await executor(args);
      this._matchRunResult = { data: result, error: null };
    } catch (e) {
      this._matchRunResult = { data: null, error: e.message ?? String(e) };
    } finally {
      this._matchRunBusy = false;
    }
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
    if (!this._getExecutor(def)) return nothing;
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

  _renderMatchResult() {
    if (!this._matchResult) {
      if (!this._matchQuery.trim()) return nothing;
      return html`<div class="gt-match-empty">No approved tool matched this request yet.</div>`;
    }

    const { tool, score, matchedTerms } = this._matchResult;
    return html`
      <div class="gt-match-result">
        <div class="gt-match-result-top">
          <div>
            <div class="gt-match-title">${tool.name}</div>
            <div class="gt-match-meta">Best local match · score ${score}</div>
          </div>
          <span class="gt-badge gt-badge-approved">${tool.status}</span>
        </div>
        <p class="gt-desc">${tool.description}</p>
        ${matchedTerms?.length ? html`
          <div class="gt-match-tags">
            ${matchedTerms.map((term) => html`<span class="gt-match-tag">${term}</span>`)}
          </div>
        ` : nothing}
        <div class="gt-try-actions">
          <button class="gt-btn gt-btn-approve" ?disabled=${this._matchRunBusy} @click=${() => this._runMatchedTool()}>
            ${this._matchRunBusy ? 'Running…' : 'Run matched tool'}
          </button>
        </div>
        ${this._matchRunResult
          ? html`
            <div class="gt-result ${this._matchRunResult.error ? 'gt-result-error' : ''}" role="status">
              ${this._matchRunResult.error
                ? this._matchRunResult.error
                : html`<pre>${JSON.stringify(this._matchRunResult.data, null, 2)}</pre>`}
            </div>
          `
          : nothing}
      </div>
    `;
  }

  _renderFinder(approved) {
    if (!approved.length) return nothing;
    return html`
      <section class="gt-section gt-section-finder" aria-label="Find matching tool">
        <h3 class="gt-section-title">Find a matching tool</h3>
        <p class="gt-empty">Reuse an approved tool by matching against its name, description, tags, and example prompts.</p>
        <label class="gt-try-label" for="gt-match-query">What do you want to do?</label>
        <input
          id="gt-match-query"
          class="gt-match-input"
          .value=${this._matchQuery}
          @input=${(e) => { this._matchQuery = e.target.value; }}
          placeholder="e.g. check heading structure for accessibility" />
        <label class="gt-try-label" for="gt-match-content">HTML to run against</label>
        <textarea
          id="gt-match-content"
          class="gt-try-input"
          rows="6"
          .value=${this._matchInput}
          @input=${(e) => { this._matchInput = e.target.value; }}
          placeholder="<h1>Title</h1><h2>Section</h2><h4>Skipped level</h4>"></textarea>
        <div class="gt-try-actions">
          <button class="gt-btn gt-btn-try" @click=${this._findMatch}>Find best match</button>
        </div>
        ${this._renderMatchResult()}
      </section>
    `;
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
          <button
            type="button"
            class="gt-card-title-btn"
            aria-expanded=${isExpanded}
            aria-controls="gt-detail-${def.id}"
            @click=${() => this._toggleExpand(def.id)}
          >
            <span class="gt-card-name">${def.name}</span>
            <span class="gt-card-arrow" aria-hidden="true">${isExpanded ? '▲' : '▼'}</span>
          </button>
          <div class="gt-card-toolbar">
            <span class="gt-badge gt-badge-${def.status}">${def.status}</span>
            ${this._renderActions(def)}
          </div>
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
          <h3 class="gt-section-title">Proposals (${drafts.length})</h3>
          ${drafts.length === 0
            ? html`<p class="gt-empty">No pending proposals. The assistant will suggest tools here when it encounters a task that doesn't match existing tools.</p>`
            : drafts.map((def) => this._renderToolCard(def))}
        </section>

        <section class="gt-section" aria-label="Approved tools">
          <h3 class="gt-section-title">Approved tools (${approved.length})</h3>
          ${approved.length === 0
            ? html`<p class="gt-empty">No approved tools yet. Approve a proposal above to make it available in chat.</p>`
            : approved.map((def) => this._renderToolCard(def))}
        </section>

        ${this._renderFinder(approved)}

        ${deprecated.length > 0 ? html`
          <section class="gt-section gt-section-deprecated" aria-label="Deprecated tools">
            <h3 class="gt-section-title">Deprecated (${deprecated.length})</h3>
            ${deprecated.map((def) => this._renderToolCard(def))}
          </section>
        ` : nothing}
      </div>`;
  }
}

customElements.define('nx-generated-tools', NXGeneratedTools);

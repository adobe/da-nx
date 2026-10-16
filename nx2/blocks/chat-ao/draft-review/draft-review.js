import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const style = await loadStyle(import.meta.url);
const buttons = await loadStyle(new URL('../../../styles/buttons.css', import.meta.url).href);

const RESULT_LABELS = {
  applied: 'Version saved; changes applied',
  restored: 'Previous version restored',
  rejected: 'Rejected; original unchanged',
  applying: 'Apply not confirmed. Check version history before making further changes.',
  restoring: 'Restore not confirmed. Check version history before making further changes.',
};

export class CmaDraftReview extends LitElement {
  static properties = {
    review: { attribute: false },
    sessionKey: { type: String },
    onAction: { attribute: false },
    disabled: { type: Boolean },
    _state: { state: true },
    _excluded: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttons, style];
  }

  updated(changed) {
    if ((changed.has('review') || changed.has('sessionKey')) && this.review) {
      this._state = undefined;
      this._excluded = [];
      this._act('status');
    }
  }

  async _act(action, paths) {
    if (this._busy || (action !== 'status' && this.disabled)) return;
    this._busy = true;
    this._error = '';
    try {
      this._state = await this.onAction({ action, review: this.review, paths });
    } catch (error) {
      this._error = error.message;
    } finally {
      this._busy = false;
    }
  }

  _toggle(path) {
    this._excluded = this._excluded.includes(path)
      ? this._excluded.filter((p) => p !== path) : [...this._excluded, path];
  }

  render() {
    if (!this.review) return nothing;
    const { type, summary, pages } = this.review;
    const locked = this.disabled || this._busy || !this._state;
    const planned = type === 'plan';
    const approved = !!this._state?.approvedPaths;
    const results = this._state?.results ?? {};
    const pending = pages.filter((p) => !results[p.path]);
    const applied = pages.filter((p) => results[p.path]?.status === 'applied');
    const selected = pages.filter((p) => !this._excluded?.includes(p.path)).map((p) => p.path);
    const uncertain = Object.values(results).some((r) => ['applying', 'restoring'].includes(r.status));
    const finished = !planned && pending.length === 0 && !uncertain;
    const readyTitle = finished ? 'Review complete' : 'Ready to review';
    const planTitle = approved && !this._state.approvedPaths.length ? 'Plan rejected' : 'Before I start';
    const decided = Object.values(results);
    const resultSummary = decided.length
      ? `${applied.length} applied, ${decided.filter((r) => r.status === 'rejected').length} rejected, ${decided.filter((r) => r.status === 'restored').length} restored.`
      : summary;
    return html`
      <section aria-label=${planned ? 'AI change plan' : 'AI draft review'} aria-busy=${this._busy ? 'true' : 'false'}>
        <header><strong>${planned ? planTitle : readyTitle}</strong>
          <span>${pages.length} pages</span></header>
        <p>${planned ? summary : resultSummary}</p>
        <p class="note">${planned
    ? 'Approve the scope first. The assistant will edit draft copies only.'
    : 'Approval saves a version before updating the original. Nothing is previewed or published.'}</p>
        <ul>
          ${pages.map((page) => {
    const result = results[page.path];
    return html`<li>
              <strong>${page.title}</strong>
              <code>${page.path}</code>
              <p>${page.summary}</p>
              ${planned ? html`
                ${approved ? html`<span class="status">${this._state.approvedPaths.includes(page.path) ? 'Scope approved' : 'Excluded'}</span>` : html`
                  <label><input type="checkbox" .checked=${!this._excluded?.includes(page.path)}
                    ?disabled=${locked} @change=${() => this._toggle(page.path)}> Include page</label>
                `}
              ` : html`
                <div class="actions">
                  <button type="button" class="nx-action-btn nx-btn-sm" ?disabled=${locked}
                    @click=${() => this._act('diff', [page.path])}>View diff</button>
                  ${!result ? html`
                    <button type="button" class="nx-btn-primary nx-btn-sm" ?disabled=${locked}
                      @click=${() => this._act('apply', [page.path])}>Approve</button>
                    <button type="button" class="nx-action-btn nx-btn-sm" ?disabled=${locked}
                      @click=${() => this._act('reject', [page.path])}>Reject</button>
                  ` : html`
                    <span class="status">${RESULT_LABELS[result.status]}</span>
                    ${result.status === 'applied' ? html`
                      <button type="button" class="nx-action-btn nx-btn-sm" ?disabled=${locked}
                        @click=${() => this._act('restore', [page.path])}>Restore previous version</button>
                    ` : nothing}
                  `}
                </div>
              `}
            </li>`;
  })}
        </ul>
        ${planned && !approved ? html`
          <div class="actions">
            <button type="button" class="nx-btn-primary nx-btn-sm" ?disabled=${locked || !selected.length}
              @click=${() => this._act('approve-scope', selected)}>Approve ${selected.length} pages</button>
            <button type="button" class="nx-action-btn nx-btn-sm" ?disabled=${locked}
              @click=${() => this._act('reject-scope', [])}>Reject plan</button>
          </div>
        ` : nothing}
        ${planned && approved && this._state.approvedPaths.length ? html`
          <details>
            <summary>Connection recovery</summary>
            <button type="button" class="nx-action-btn nx-btn-sm" ?disabled=${locked}
              @click=${() => this._act('continue-scope', this._state.approvedPaths)}>Continue approved plan</button>
          </details>
        ` : nothing}
        ${!planned && pending.length ? html`
          <div class="actions">
            <button type="button" class="nx-btn-primary nx-btn-sm" ?disabled=${locked}
              @click=${() => this._act('apply', pending.map((p) => p.path))}>Approve all remaining</button>
            <button type="button" class="nx-action-btn nx-btn-sm" ?disabled=${locked}
              @click=${() => this._act('reject', pending.map((p) => p.path))}>Reject all remaining</button>
          </div>
        ` : nothing}
        ${finished && applied.length ? html`
          <div class="actions"><button type="button" class="nx-action-btn nx-btn-sm" ?disabled=${locked}
            @click=${() => this._act('restore', applied.map((p) => p.path))}>Restore all previous versions</button></div>
        ` : nothing}
        ${this._busy ? html`<p role="status">Working...</p>` : nothing}
        ${this._error ? html`<p class="error" role="alert">${this._error}</p>
          <button type="button" class="nx-action-btn nx-btn-sm" ?disabled=${this._busy}
            @click=${() => this._act('status')}>Refresh review state</button>` : nothing}
      </section>`;
  }
}

customElements.define('nx-cma-draft-review', CmaDraftReview);

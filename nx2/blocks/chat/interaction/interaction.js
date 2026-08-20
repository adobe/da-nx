import { LitElement, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { renderApprovalCard } from '../renderers/card-renderers.js';
import { renderPlanApprovalCard } from '../ao/ao-renderers.js';

const styles = await loadStyle(import.meta.url);

/**
 * Renders whichever single interaction the active backend has suspended the current
 * turn for. approval/plan are mutually exclusive at any moment (see
 * chat-backend.js#_normalize, which is what produces `pending` as a discriminated
 * union `{ type: 'approval'|'plan', ... } | null` instead of two separate
 * properties). Mirrors nx-chat-pills/nx-prompts: a sibling component chat.js mounts
 * and drives via props/callbacks, rather than chat.js owning this draft state and
 * markup itself.
 */
class NxChatInteraction extends LitElement {
  static properties = {
    pending: { type: Object },
    _planFeedback: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeydown);
  }

  willUpdate(changed) {
    if (!changed.has('pending')) return;
    // Plan ids can repeat across turns ("1", "2", ...) — clear the stale draft only
    // when a genuinely new plan arrives, not on every re-render of the same one.
    if (this.pending?.type === 'plan' && this.pending.turnId !== this._lastPlanTurnId) {
      this._planFeedback = '';
      this._lastPlanTurnId = this.pending.turnId;
    }
  }

  _onKeydown = (e) => {
    if (this.pending?.type !== 'approval') return;
    const { toolCallId } = this.pending;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.onApprove?.(toolCallId, false);
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      this.onApprove?.(toolCallId, true, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.onApprove?.(toolCallId, true);
    }
  };

  _approvePlan() {
    this.onApprovePlan?.();
    this._planFeedback = '';
  }

  _rejectPlan() {
    this.onRejectPlan?.(this._planFeedback?.trim());
    this._planFeedback = '';
  }

  render() {
    const { pending } = this;
    if (!pending) return nothing;

    if (pending.type === 'approval') {
      return renderApprovalCard(pending, (toolCallId, approved, always) => (
        this.onApprove?.(toolCallId, approved, always)
      ));
    }

    if (pending.type === 'plan') {
      return renderPlanApprovalCard(pending, this._planFeedback ?? '', {
        onFeedbackText: (text) => { this._planFeedback = text; },
        onApprove: () => this._approvePlan(),
        onReject: () => this._rejectPlan(),
      });
    }

    return nothing;
  }
}

customElements.define('nx-chat-interaction', NxChatInteraction);

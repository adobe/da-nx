import { LitElement, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { renderApprovalCard } from '../renderers/card-renderers.js';
import { renderQuestionCard, renderPlanApprovalCard } from '../ao/ao-renderers.js';

const styles = await loadStyle(import.meta.url);

/**
 * Renders whichever single interaction the active backend has suspended the current
 * turn for. approval/question/plan are mutually exclusive at any moment (see
 * chat-backend.js#_normalize, which is what produces `pending` as a discriminated
 * union `{ type: 'approval'|'question'|'plan', ... } | null` instead of three
 * separate properties). Mirrors nx-chat-pills/nx-prompts: a sibling component chat.js
 * mounts and drives via props/callbacks, rather than chat.js owning this draft state
 * and markup itself.
 */
class NxChatInteraction extends LitElement {
  static properties = {
    pending: { type: Object },
    _questionAnswers: { state: true },
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
    // Question/plan ids can repeat across turns ("1", "2", ...) — clear stale drafts
    // only when a genuinely new question/plan set arrives, not on every re-render of
    // the same one.
    if (this.pending?.type === 'question' && this.pending.turnId !== this._lastQuestionTurnId) {
      this._questionAnswers = {};
      this._lastQuestionTurnId = this.pending.turnId;
    }
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

  _questionAnswerEntry(qId) {
    this._questionAnswers ??= {};
    this._questionAnswers[qId] ??= { options: new Set(), text: '' };
    return this._questionAnswers[qId];
  }

  _toggleQuestionOption(qId, label, multiSelect) {
    const entry = this._questionAnswerEntry(qId);
    if (multiSelect) {
      if (entry.options.has(label)) entry.options.delete(label); else entry.options.add(label);
    } else {
      entry.options = entry.options.has(label) ? new Set() : new Set([label]);
    }
    this.requestUpdate();
  }

  _setQuestionText(qId, text) {
    this._questionAnswerEntry(qId).text = text;
  }

  _submitQuestion() {
    const answersByQuestionId = {};
    Object.entries(this._questionAnswers ?? {}).forEach(([qId, entry]) => {
      const opts = [...entry.options];
      if (entry.text?.trim()) opts.push(entry.text.trim());
      answersByQuestionId[qId] = opts;
    });
    this.onAnswerQuestion?.(answersByQuestionId);
    this._questionAnswers = {};
  }

  _declineQuestion() {
    this.onDeclineQuestion?.();
    this._questionAnswers = {};
  }

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

    if (pending.type === 'question') {
      return renderQuestionCard(pending, this._questionAnswers ?? {}, {
        onToggle: (qId, label, multi) => this._toggleQuestionOption(qId, label, multi),
        onText: (qId, text) => this._setQuestionText(qId, text),
        onSubmit: () => this._submitQuestion(),
        onDecline: () => this._declineQuestion(),
      });
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

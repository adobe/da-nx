import { LitElement, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { renderApprovalCard } from '../renderers/card-renderers.js';

const styles = await loadStyle(import.meta.url);

/**
 * Renders the pending tool-call approval, if any (see chat-backend.js#_normalize,
 * which produces `pending` as `{ type: 'approval', ... } | null`). Mirrors
 * nx-chat-pills/nx-prompts: a sibling component chat.js mounts and drives via
 * props/callbacks, rather than chat.js owning this draft state and markup itself.
 */
class NxChatInteraction extends LitElement {
  static properties = {
    pending: { type: Object },
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

  render() {
    const { pending } = this;
    if (!pending) return nothing;

    if (pending.type === 'approval') {
      return renderApprovalCard(pending, (toolCallId, approved, always) => (
        this.onApprove?.(toolCallId, approved, always)
      ));
    }

    return nothing;
  }
}

customElements.define('nx-chat-interaction', NxChatInteraction);

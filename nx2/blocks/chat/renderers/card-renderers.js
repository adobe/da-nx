import { html, nothing } from 'da-lit';

/**
 * Backend-neutral tool-activity/approval card rendering.
 *
 * Neither function here knows about any controller's wire vocabulary
 * (da-agent's TOOL_STATE, AO's own state names, etc). Each controller's own
 * adapter is responsible for translating its backend's concepts into the
 * small display shapes below before handing them to these renderers — see
 * chat.js (da-agent adapter) and ao/chat-controller-ao.js (AO adapter).
 *
 * This is the first piece of a gradual migration off renderers.js: as more
 * of that file's rendering is proven generic, it moves here and the
 * renderers.js original is deleted once nothing calls it.
 */

/**
 * @param {{
 *   toolName: string,
 *   detail: string|null,
 *   hidden: boolean,
 *   failed: boolean,
 *   state: string,
 * }} card
 */
export function renderToolCard(card) {
  if (!card || card.hidden) return nothing;
  const {
    toolName, detail, failed, state,
  } = card;
  const status = failed ? html`<span class="tool-card-status">${state}</span>` : nothing;
  return detail ? html`
    <details class="tool-card tool-card-${state}">
      <summary>${toolName}${status}</summary>
      <span class="tool-card-detail">${detail}</span>
    </details>` : html`<span class="tool-card-detail">${toolName}${status}</span>`;
}

/**
 * @param {{ toolCallId: string, toolName: string, summary: string|null }|null} pending
 * @param {(toolCallId: string, approved: boolean, always?: boolean) => void} onApprove
 */
/**
 * Post-execution continuation gate: a tool has finished and the agent paused for the user
 * to review its result before continuing. Backend-neutral (only da-agent produces it today).
 * @param {() => void} onContinue
 * @param {() => void} onStop
 */
export function renderContinuationCard(onContinue, onStop) {
  return html`
    <div class="approval-actions">
      <span class="approval-tool-name">Review the results before continuing</span>
      <div class="approval-buttons">
        <button type="button" class="secondary-btn" @click=${() => onStop()}>
          <span>Stop</span><kbd>Esc</kbd>
        </button>
        <button type="button" class="action-btn" @click=${() => onContinue()}>
          <span>Continue</span><kbd>↵</kbd>
        </button>
      </div>
    </div>
  `;
}

export function renderApprovalCard(pending, onApprove) {
  if (!pending) return nothing;
  const { toolCallId, toolName, summary } = pending;
  return html`
    <div class="approval-actions">
      <span class="approval-tool-name">${toolName}</span>
      ${summary ? html`<span class="approval-summary">${summary}</span>` : nothing}
      <div class="approval-buttons">
        <button type="button" class="secondary-btn" @click=${() => onApprove(toolCallId, false)}>
          <span>Reject</span><kbd>Esc</kbd>
        </button>
        <button type="button" class="secondary-btn" @click=${() => onApprove(toolCallId, true, true)}>
          <span>Always approve</span><kbd>⌘↵</kbd>
        </button>
        <button type="button" class="action-btn" @click=${() => onApprove(toolCallId, true)}>
          <span>Approve</span><kbd>↵</kbd>
        </button>
      </div>
    </div>
  `;
}

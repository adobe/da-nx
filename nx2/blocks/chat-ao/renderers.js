/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { html, nothing } from 'da-lit';
import { renderMarkdown } from './utils/markdown.js';
import { renderUiArtifact } from './artifacts/index.js';
import { renderCopyButton } from '../shared/chat/copy-button.js';

// See docs/chat-ao-component.md#tool-call-activity for why this isn't truncated.
function formatToolCallDetail(value) {
  if (value == null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text || null;
}

// See docs/chat-ao-component.md#tool-call-activity for the collapsed-vs-inline choice.
export function renderToolCallCard({
  toolCallId, toolName, title, status, arguments: args, result, summaryText, calls, loadingCalls,
}, { onExpand } = {}) {
  if (status === 'summary') {
    return html`
      <details class="tool-call-card tool-call-summary" @toggle=${(e) => e.target.open && onExpand?.(toolCallId)}>
        <summary>
          ${summaryText || toolName}
          ${loadingCalls ? html`<span class="nx-loading-spinner"></span>` : nothing}
        </summary>
        ${calls?.length ? html`
          <div class="tool-call-children">
            ${calls.map((call) => renderToolCallCard(call))}
          </div>
        ` : nothing}
      </details>
    `;
  }
  // See docs/chat-ao-component.md#tool-call-activity — label stays fixed
  // across detected/running/done on purpose.
  const label = `Using ${title ?? toolName}`;
  const terminal = status === 'success' || status === 'error';
  const statusEl = status === 'error' ? html`<span class="tool-call-status">error</span>` : nothing;
  const detail = formatToolCallDetail(terminal ? result : args);
  if (!detail) return html`<span class="tool-call-detail tool-call-${status}">${label}${statusEl}</span>`;
  return html`
    <details class="tool-call-card tool-call-${status}">
      <summary>${label}${statusEl}</summary>
      <span class="tool-call-detail">${detail}</span>
    </details>
  `;
}

export function renderAssistantMessageBody(msg, { onExpandToolCall } = {}) {
  if (msg.toolCall) return renderToolCallCard(msg.toolCall, { onExpand: onExpandToolCall });
  if (msg.uiArtifact) return renderUiArtifact(msg.uiArtifact);
  return html`
    <div class="message-content">${renderMarkdown(msg.content)}</div>
    ${renderCopyButton(msg.content, { streaming: msg.streaming })}
  `;
}

// See docs/chat-ao-component.md#permission-requests for the nx-chat visual-parity rationale.
function renderPermissionRow(call, decisions, onDecide) {
  const detail = formatToolCallDetail(call.arguments);
  const decided = call.toolCallId in decisions;
  return html`
    <div class="permission-row">
      <span class="permission-row-tool">${call.toolName}</span>
      ${detail ? html`<span class="permission-row-detail">${detail}</span>` : nothing}
      ${decided ? html`
        <span class="permission-row-status permission-row-${decisions[call.toolCallId] ? 'approved' : 'rejected'}">
          ${decisions[call.toolCallId] ? 'approved' : 'rejected'}
        </span>
      ` : html`
        <div class="permission-row-buttons">
          <button type="button" class="nx-action-btn nx-btn-sm" @click=${() => onDecide(call.toolCallId, false)}>Reject</button>
          <button type="button" class="nx-btn-primary nx-btn-sm" @click=${() => onDecide(call.toolCallId, true)}>Approve</button>
        </div>
      `}
    </div>
  `;
}

// See docs/chat-ao-component.md#permission-requests — decisions are
// collected per row locally; nothing is sent until every row has one.
export function renderPermissionCard(pending, { onDecide }) {
  if (!pending) return nothing;
  return html`
    <div class="permission-card">
      ${pending.calls.map((call) => renderPermissionRow(call, pending.decisions, onDecide))}
    </div>
  `;
}

export function renderPlanApprovalCard(pending, feedback, { onFeedbackText, onApprove, onReject }) {
  if (!pending) return nothing;
  return html`
    <div class="plan-approval-card">
      <span class="plan-approval-header">Review plan</span>
      <div class="message-content">${renderMarkdown(pending.planContent)}</div>
      <input
        type="text"
        class="plan-approval-feedback"
        placeholder="Optional feedback if rejecting…"
        .value=${feedback}
        @input=${(e) => onFeedbackText(e.target.value)}
      />
      <div class="plan-approval-buttons">
        <button type="button" class="nx-action-btn nx-btn-sm" @click=${onReject}>Reject</button>
        <button type="button" class="nx-btn-primary nx-btn-sm" @click=${onApprove}>Approve</button>
      </div>
    </div>
  `;
}

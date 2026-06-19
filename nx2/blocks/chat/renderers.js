import { html, nothing } from 'da-lit';
import {
  AGENT_EVENT, DIRECTIVE_TYPE, ROLE, TOOL_INPUT, TOOL_NAME, TOOL_STATE,
} from './constants.js';
import { getConfig } from '../../scripts/nx.js';
import { parseDirectives } from './utils/parse.js';
import { fileIconName } from './utils/icons.js';

const { codeBase } = getConfig();

const { unified, remarkParse, remarkGfmNoLink, mdast2hast, hastToDom } = await import('../../deps/mdast/dist/index.js');

const SAFE_URL = /^https?:\/\//i;

const parser = unified().use(remarkParse).use(remarkGfmNoLink);

function sanitizeLinks(node) {
  if (node.type === 'element' && node.tagName === 'a') {
    const href = node.properties?.href ?? '';
    node.properties = {
      ...node.properties,
      href: SAFE_URL.test(href) ? href : '#',
      target: '_blank',
      rel: ['noopener', 'noreferrer'],
    };
  }
  node.children?.forEach(sanitizeLinks);
  return node;
}

function toDOM(hast) {
  return hastToDom(sanitizeLinks(hast), { fragment: true });
}

function parseDirectiveJSON(content) {
  try {
    return JSON.parse(content.trim());
  } catch {
    return null;
  }
}

function renderPlanDirective(content) {
  const plan = parseDirectiveJSON(content);
  if (!plan) return html`<div class="directive directive-plan"></div>`;
  const el = document.createElement('nx-campaign-plan-card');
  el.plan = plan;
  return el;
}

function renderTaskListDirective(content) {
  const data = parseDirectiveJSON(content);
  if (!data) return html`<div class="directive directive-task-list"></div>`;
  const el = document.createElement('nx-task-list');
  el.tasks = data.tasks ?? [];
  return el;
}

function renderTaskItemDirective(content) {
  const data = parseDirectiveJSON(content);
  if (!data) return html`<div class="directive directive-task-item"></div>`;
  const el = document.createElement('nx-task-item');
  el.status = data.status ?? 'pending';
  el.label = data.label ?? '';
  if (data.current != null) el.current = data.current;
  if (data.total != null) el.total = data.total;
  return el;
}

/**
 * Merge :::task-item status updates from streaming text into a submit_plan task list.
 * Returns a new plan object with updated task statuses, or the original if nothing changed.
 */
function mergeTaskItemsFromText(plan, streamingText) {
  if (!streamingText || !plan?.tasks?.length) return plan;
  const directives = parseDirectives(streamingText);
  const updates = new Map();
  for (const d of directives) {
    if (d.kind === 'directive' && d.type === DIRECTIVE_TYPE.TASK_ITEM) {
      const data = parseDirectiveJSON(d.content);
      if (data?.label) updates.set(data.label, data.status);
    }
  }
  if (!updates.size) return plan;
  return {
    ...plan,
    tasks: plan.tasks.map((t) => ({ ...t, status: updates.get(t.label) ?? t.status })),
  };
}

function mergeTaskItemsIntoPlan(directives) {
  const planIdx = directives.findIndex((d) => d.kind === 'directive' && d.type === DIRECTIVE_TYPE.PLAN);
  if (planIdx < 0) return directives;

  // Collect the latest status for each label from subsequent :::task-item directives
  const updates = new Map();
  for (let i = planIdx + 1; i < directives.length; i += 1) {
    const d = directives[i];
    if (d.kind === 'directive' && d.type === DIRECTIVE_TYPE.TASK_ITEM) {
      const data = parseDirectiveJSON(d.content);
      if (data?.label) updates.set(data.label, data.status);
    }
  }

  if (!updates.size) return directives;

  const planData = parseDirectiveJSON(directives[planIdx].content);
  if (!planData?.tasks) return directives;

  const merged = directives.map((d, i) => {
    if (i === planIdx) {
      return {
        ...d,
        content: JSON.stringify({
          ...planData,
          tasks: planData.tasks.map((t) => ({ ...t, status: updates.get(t.label) ?? t.status })),
        }),
      };
    }
    // Suppress standalone task-item blocks that belong to this plan
    if (i > planIdx && d.kind === 'directive' && d.type === DIRECTIVE_TYPE.TASK_ITEM) {
      return null;
    }
    return d;
  });

  return merged.filter(Boolean);
}

function renderMessageContent(text) {
  if (!text) return nothing;

  const directives = mergeTaskItemsIntoPlan(parseDirectives(text));

  return directives.map(({ kind, type, content }) => {
    if (kind === 'directive') {
      if (type === DIRECTIVE_TYPE.PLAN) return renderPlanDirective(content);
      if (type === DIRECTIVE_TYPE.TASK_LIST) return renderTaskListDirective(content);
      if (type === DIRECTIVE_TYPE.TASK_ITEM) return renderTaskItemDirective(content);
      const dom = toDOM(mdast2hast(parser.parse(content)));
      return html`<div class="directive directive-${type}">${dom}</div>`;
    }
    return toDOM(mdast2hast(parser.parse(content)));
  });
}

function approvalSummary(input) {
  if (!input) return null;
  const {
    HUMAN_READABLE_SUMMARY, SOURCE_PATH, DESTINATION_PATH, PATH, SKILL_ID, NAME,
  } = TOOL_INPUT;
  return input[HUMAN_READABLE_SUMMARY]
    ?? (input[SOURCE_PATH] && input[DESTINATION_PATH] ? `${input[SOURCE_PATH]} → ${input[DESTINATION_PATH]}` : null)
    ?? input[PATH] ?? input[SKILL_ID] ?? input[NAME] ?? null;
}

function renderSubmitPlanCard(plan, streamingText) {
  const merged = mergeTaskItemsFromText(plan, streamingText);
  const el = document.createElement('nx-campaign-plan-card');
  el.plan = merged;
  return el;
}

function renderToolCard(toolCallId, toolCards, streamingText) {
  const card = toolCards?.get(toolCallId);
  if (!card || card.state === TOOL_STATE.APPROVAL_REQUESTED) return nothing;
  const { toolName, state, input } = card;
  if (toolName === TOOL_NAME.SUBMIT_PLAN) return renderSubmitPlanCard(input, streamingText);
  const detail = approvalSummary(input);
  const failed = state === TOOL_STATE.ERROR || state === TOOL_STATE.REJECTED;
  return html`
    <details class="tool-card tool-card-${state}">
      <summary>${toolName}${failed ? html`<span class="tool-card-status">${state}</span>` : nothing}</summary>
      ${detail ? html`<span class="tool-card-detail">${detail}</span>` : nothing}
    </details>
  `;
}

function renderApprovalCard(pending, onApprove) {
  if (!pending) return nothing;
  const { toolCallId, toolName, input } = pending;
  if (toolName === TOOL_NAME.SUBMIT_PLAN) {
    const el = document.createElement('nx-campaign-plan-card');
    el.plan = input;
    el.addEventListener('nx-plan-run', () => onApprove(toolCallId, true));
    return el;
  }
  const summary = approvalSummary(input);
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

function renderAssistantMessage(msg, toolCards, streamingText) {
  if (Array.isArray(msg.content)) {
    return html`${msg.content.map((part) => (part.type === AGENT_EVENT.TOOL_CALL
      ? renderToolCard(part.toolCallId, toolCards, streamingText)
      : nothing))}`;
  }

  const copy = msg.streaming ? nothing : html`<button class="message-action-copy" @click=${() => navigator.clipboard.writeText(msg.content)} aria-label="Copy">
      <svg class="icon-paste" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-paste-20-n.svg#icon"></use></svg>
      <svg class="icon-checkmark" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-checkmark-20-n.svg#icon"></use></svg>
    </button>`;

  return html`
    <div class="message message-assistant">
      <div class="message-content">${renderMessageContent(msg.content)}</div>
      ${copy}
    </div>
  `;
}

function renderSelectionPills(msg) {
  const contextItem = (name) => html`
    <li class="selection-context-item">
      <svg class="selection-icon" viewBox="0 0 20 20" aria-hidden="true">
        <use href="${codeBase}/img/icons/${fileIconName(name)}.svg#icon"></use>
      </svg>
      <span>${name}</span>
    </li>`;

  const items = [
    ...(msg.selectionContext ?? []).map(({ blockName }) => contextItem(blockName)),
    ...(msg.attachmentsMeta ?? []).map(({ fileName }) => contextItem(fileName)),
  ];
  if (items.length === 1) {
    return html`<ul class="selection-context-list" aria-label="Attached context">${items[0]}</ul>`;
  }
  if (items.length > 1) {
    return html`<details class="selection-context">
        <summary><span class="selection-context-count">${items.length} items added</span></summary>
        <ul class="selection-context-list">${items}</ul>
      </details>`;
  }
  return nothing;
}

function renderUserMessage(msg) {
  return html`
    <div class="message message-user">
      ${renderSelectionPills(msg)}
      <div class="message-content">${msg.content}</div>
    </div>
  `;
}

function renderMessage(msg, toolCards, streamingText) {
  if (msg.role === ROLE.TOOL) return nothing;
  return msg.role === ROLE.ASSISTANT
    ? renderAssistantMessage(msg, toolCards, streamingText)
    : renderUserMessage(msg);
}

export { renderMessage, renderApprovalCard };

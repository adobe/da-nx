import { html, nothing } from 'da-lit';
import {
  DIRECTIVE_TYPE, PART_TYPE, ROLE, TOOL_INPUT, TOOL_NAME, TOOL_STATE,
} from '../constants.js';
import { getConfig } from '../../../scripts/nx.js';
import { parseDirectives } from '../utils/parse.js';
import {
  parseDirectiveJSON, parseToolOutput, mergeTaskItemsFromText, mergeTaskItemsIntoPlan,
} from '../utils/directives.js';
import { pillIconName } from '../utils/icons.js';
import { linkifyBareUrls, sanitizeLinks } from '../utils/links.js';
import { mcpToolName } from '../utils/tool-name.js';
import '../messages/campaign-plan-card.js';
import '../messages/governance-evaluation-card.js';
import '../messages/task-list.js';

const { codeBase } = getConfig();

const { unified, remarkParse, remarkGfmNoLink, mdast2hast, hastToDom } = await import('../../../deps/mdast/dist/index.js');

const parser = unified().use(remarkParse).use(remarkGfmNoLink);

function toDOM(hast) {
  return hastToDom(sanitizeLinks(linkifyBareUrls(hast)), { fragment: true });
}

function renderPlanDirective(content) {
  const plan = parseDirectiveJSON(content);
  if (!plan) return html`<div class="directive directive-plan"></div>`;
  return html`<nx-campaign-plan-card .plan=${plan}></nx-campaign-plan-card>`;
}

function renderTaskListDirective(content) {
  const data = parseDirectiveJSON(content);
  if (!data) return html`<div class="directive directive-task-list"></div>`;
  return html`<nx-task-list .tasks=${data.tasks ?? []}></nx-task-list>`;
}

function renderGovernanceEvaluationDirective(content) {
  const evaluation = parseDirectiveJSON(content);
  if (!evaluation) return html`<div class="directive directive-governance-evaluation"></div>`;
  return html`<nx-governance-evaluation-card .evaluation=${evaluation}></nx-governance-evaluation-card>`;
}

function renderMessageContent(text) {
  if (!text) return nothing;

  // Fold standalone :::task-item directives into a preceding :::plan payload (if any) so
  // task status renders inside the plan card rather than as loose fragments.
  const directives = mergeTaskItemsIntoPlan(parseDirectives(text));

  const items = directives.map(({ kind, type, content }) => {
    if (kind === 'directive') {
      if (type === DIRECTIVE_TYPE.PLAN) return renderPlanDirective(content);
      if (type === DIRECTIVE_TYPE.TASK_LIST) return renderTaskListDirective(content);
      // task-item directives drive plan/exit_plan card status; never render standalone.
      if (type === DIRECTIVE_TYPE.TASK_ITEM) return nothing;
      if (type === DIRECTIVE_TYPE.GOVERNANCE_EVALUATION) {
        return renderGovernanceEvaluationDirective(content);
      }
      if (!content) return nothing;
      const dom = toDOM(mdast2hast(parser.parse(content)));
      return html`<div class="directive directive-${type}">${dom}</div>`;
    }
    if (!content) return nothing;
    return toDOM(mdast2hast(parser.parse(content)));
  }).filter((item) => item !== nothing);

  return items.length ? items : nothing;
}

function approvalSummary(input, { json = false } = {}) {
  if (!input) return null;
  const {
    HUMAN_READABLE_SUMMARY, SOURCE_PATH, DESTINATION_PATH, PATH, SKILL_ID, NAME,
  } = TOOL_INPUT;
  return input[HUMAN_READABLE_SUMMARY]
    ?? (input[SOURCE_PATH] && input[DESTINATION_PATH] ? `${input[SOURCE_PATH]} → ${input[DESTINATION_PATH]}` : null)
    ?? input[PATH] ?? input[SKILL_ID] ?? input[NAME]
    ?? (json ? JSON.stringify(input, null, 2) : null);
}

// exit_plan_mode is a single stateful card living in the message stream across its whole
// lifecycle: awaiting approval (Run enabled → approves the tool call), then executing
// (task statuses merged from :::task-item directives in assistant text → Running/Done).
function renderExitPlanCard(plan, taskText, onRun) {
  const merged = mergeTaskItemsFromText(plan, taskText);
  return html`<nx-campaign-plan-card .plan=${merged} @nx-plan-run=${onRun}></nx-campaign-plan-card>`;
}

function renderToolCard(toolCallId, toolCards, { streamingText, onApprove } = {}) {
  const card = toolCards?.get(toolCallId);
  if (!card) return nothing;
  const {
    toolName, state, input, output,
  } = card;
  const shortToolName = mcpToolName(toolName);

  // exit_plan_mode renders its plan card in every state (including AWAITING_APPROVAL),
  // with Run wired to approve the tool call — so it is not gated by the bottom approval UI.
  if (shortToolName === TOOL_NAME.EXIT_PLAN_MODE) {
    return renderExitPlanCard(input, streamingText, () => onApprove?.(toolCallId, true));
  }

  // Every other tool: approval is surfaced by <nx-chat-interaction> at the bottom, so the
  // in-stream card stays hidden until the tool has actually run.
  if (state === TOOL_STATE.AWAITING_APPROVAL) return nothing;

  if (shortToolName === TOOL_NAME.EVALUATE_PAGE) {
    // evaluate_page runs without pre-execution approval; only OUTPUT_AVAILABLE/OUTPUT_ERROR
    // carry a real report. Before then, show the card in a loading state.
    const isError = state === TOOL_STATE.OUTPUT_ERROR;
    const parsedOutput = parseToolOutput(output);
    const errorMessage = isError
      ? (typeof parsedOutput?.error === 'string' && parsedOutput.error) || 'Page evaluation failed.'
      : undefined;
    return html`<nx-governance-evaluation-card
      .evaluation=${parsedOutput}
      .loading=${state !== TOOL_STATE.OUTPUT_AVAILABLE && state !== TOOL_STATE.OUTPUT_ERROR}
      .error=${errorMessage}
    ></nx-governance-evaluation-card>`;
  }

  const detail = approvalSummary(input, { json: true });
  const failed = state === TOOL_STATE.OUTPUT_ERROR || state === TOOL_STATE.REJECTED;
  const status = failed ? html`<span class="tool-card-status">${state}</span>` : nothing;
  return detail ? html`
    <details class="tool-card tool-card-${state}">
      <summary>${toolName}${status}</summary>
      <span class="tool-card-detail">${detail}</span>
    </details>` : html`<span class="tool-card-detail">${toolName}${status}</span>`;
}

function renderApprovalCard(pending, onApprove) {
  if (!pending) return nothing;
  const { toolCallId, toolName, input } = pending;
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

function renderAssistantMessage(msg, toolCards, opts) {
  if (Array.isArray(msg.content)) {
    return html`${msg.content.map((part) => (part.type === PART_TYPE.TOOL
      ? renderToolCard(part.toolCallId, toolCards, opts)
      : nothing))}`;
  }

  // A message that is only :::task-item directives (merged into a plan card elsewhere)
  // renders as nothing — skip the empty bubble + copy button.
  const content = renderMessageContent(msg.content);
  if (content === nothing) return nothing;

  const copy = msg.streaming ? nothing : html`<button class="message-action-copy" @click=${() => navigator.clipboard.writeText(msg.content)} aria-label="Copy">
      <svg class="icon-paste" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-paste-20-n.svg#icon"></use></svg>
      <svg class="icon-checkmark" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-checkmark-20-n.svg#icon"></use></svg>
    </button>`;

  return html`
    <div class="message message-assistant">
      <div class="message-content">${content}</div>
      ${copy}
    </div>
  `;
}

function renderSelectionPills(msg) {
  const contextItem = (name, iconName) => html`
    <li class="selection-context-item">
      <svg class="selection-icon" viewBox="0 0 20 20" aria-hidden="true">
        <use href="${codeBase}/img/icons/${iconName}.svg#icon"></use>
      </svg>
      <span>${name}</span>
    </li>`;

  const items = [
    ...(msg.selectionContext ?? []).map((sc) => {
      const name = sc.blockName || 'Selection';
      return contextItem(name, pillIconName(sc.type, name));
    }),
    ...(msg.attachmentsMeta ?? []).map(({ fileName }) => (
      contextItem(fileName, pillIconName(undefined, fileName))
    )),
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

function renderMessage(msg, toolCards, opts) {
  if (msg.role === ROLE.TOOL) return nothing;
  return msg.role === ROLE.ASSISTANT
    ? renderAssistantMessage(msg, toolCards, opts)
    : renderUserMessage(msg);
}

// renderMessageContent is additionally exported (no implementation change) so
// ao/ao-renderers.js can reuse the same markdown/directive pipeline instead of
// duplicating it — see card-renderers.js's file header for the migration rationale.
export { renderMessage, renderApprovalCard, renderMessageContent };

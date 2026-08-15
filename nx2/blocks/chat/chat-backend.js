import ChatController from './chat-controller.js';
import ChatControllerAO from './ao/chat-controller-ao.js';
import { TOOL_INPUT, TOOL_STATE } from './constants.js';

// da-agent's own tool-input schema field names (see constants.js's TOOL_INPUT) — used
// only here, to compute the approval-popover summary for da-agent's controller, since
// card-renderers.js's renderApprovalCard is backend-neutral and expects that summary
// pre-computed rather than reading raw `input` itself.
function daAgentApprovalSummary(input) {
  if (!input) return null;
  const {
    HUMAN_READABLE_SUMMARY, SOURCE_PATH, DESTINATION_PATH, PATH, SKILL_ID, NAME,
  } = TOOL_INPUT;
  return input[HUMAN_READABLE_SUMMARY]
    ?? (input[SOURCE_PATH] && input[DESTINATION_PATH] ? `${input[SOURCE_PATH]} → ${input[DESTINATION_PATH]}` : null)
    ?? input[PATH] ?? input[SKILL_ID] ?? input[NAME]
    ?? null;
}

/**
 * Wraps whichever controller nx-chat is configured to use — da-agent's ChatController
 * (untouched, on main) or AO's ChatControllerAO — behind one normalized interface, so
 * chat.js only ever makes a single decision (which backend) and never branches on it
 * again. Everything this class's onUpdate hands back is already in the neutral shapes
 * card-renderers.js/ao-renderers.js expect; AO-only actions (answerQuestion, etc.) are
 * safe to call unconditionally from chat.js since they're no-ops here when wrapping
 * da-agent's controller, which has no equivalent concept of skills-by-manifest,
 * questions, or plans.
 */
export default class ChatBackend {
  constructor(useAgentOrchestrator, { onToolDone, onUpdate }) {
    this._useAo = useAgentOrchestrator;
    const ControllerClass = useAgentOrchestrator ? ChatControllerAO : ChatController;
    this._controller = new ControllerClass({
      onToolDone,
      onUpdate: (payload) => onUpdate(this._normalize(payload)),
    });
  }

  // Approval/question/plan-approval are mutually exclusive at any moment — the agent
  // has suspended the current turn for exactly one reason, if any — so this folds all
  // three into one discriminated union rather than handing chat.js three separate
  // fields to juggle. AO's controller already hands back neutral pendingApproval/
  // pendingQuestion/pendingPlanApproval fields; da-agent's has no equivalent of any of
  // them (chat-controller.js is untouched), so pendingApproval is derived here instead,
  // from its own toolCards vocabulary.
  _normalize(payload) {
    const {
      toolCards, pendingApproval, pendingQuestion, pendingPlanApproval, ...rest
    } = payload;
    const approval = this._useAo ? pendingApproval : this._daAgentPendingApproval(toolCards);
    const pendingInteraction = this._pendingInteraction(
      approval,
      pendingQuestion,
      pendingPlanApproval,
    );
    return { ...rest, toolCards, pendingInteraction };
  }

  _pendingInteraction(approval, question, plan) {
    if (approval) return { type: 'approval', ...approval };
    if (question) return { type: 'question', ...question };
    if (plan) return { type: 'plan', ...plan };
    return null;
  }

  _daAgentPendingApproval(toolCards) {
    if (!toolCards) return null;
    for (const [toolCallId, card] of toolCards) {
      if (card.state === TOOL_STATE.AWAITING_APPROVAL) {
        return { toolCallId, toolName: card.toolName, summary: daAgentApprovalSummary(card.input) };
      }
    }
    return null;
  }

  setContext(context) {
    this._controller.setContext(context);
  }

  connect(...args) {
    return this._controller.connect(...args);
  }

  loadInitialMessages() {
    return this._controller.loadInitialMessages();
  }

  sendMessage(...args) {
    return this._controller.sendMessage(...args);
  }

  approveToolCall = (...args) => this._controller.approveToolCall(...args);

  clear() {
    return this._controller.clear();
  }

  setMcpConfig(...args) {
    this._controller.setMcpConfig(...args);
  }

  stop() {
    this._controller.stop();
  }

  destroy() {
    this._controller.destroy();
  }

  // --- AO-only actions below: safe no-ops when wrapping da-agent's controller ---

  getSkills() {
    return this._controller.getSkills?.() ?? null;
  }

  answerQuestion = (...args) => this._controller.answerQuestion?.(...args);

  declineQuestion = () => this._controller.declineQuestion?.();

  respondToPlanApproval = (...args) => this._controller.respondToPlanApproval?.(...args);
}

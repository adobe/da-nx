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
 * card-renderers.js expects. AO's controller no longer has any pending-interaction
 * concept of its own (question/plan/permission all moved to or reimplemented in
 * nx-chat-ao) — approval is always derived from da-agent's own toolCards vocabulary.
 */
export default class ChatBackend {
  constructor(useAgentOrchestrator, { onToolDone, onUpdate }) {
    const ControllerClass = useAgentOrchestrator ? ChatControllerAO : ChatController;
    this._controller = new ControllerClass({
      onToolDone,
      onUpdate: (payload) => onUpdate(this._normalize(payload)),
    });
  }

  _normalize(payload) {
    const { toolCards, ...rest } = payload;
    const approval = this._daAgentPendingApproval(toolCards);
    const pendingInteraction = approval ? { type: 'approval', ...approval } : null;
    return { ...rest, toolCards, pendingInteraction };
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
}

import ChatController from './chat-controller.js';
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
 * Wraps da-agent's ChatController behind a normalized interface, so everything this
 * class's onUpdate hands back is already in the neutral shapes card-renderers.js
 * expects — approval is derived from da-agent's own toolCards vocabulary.
 */
export default class ChatBackend {
  constructor({ onToolDone, onUpdate }) {
    this._controller = new ChatController({
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

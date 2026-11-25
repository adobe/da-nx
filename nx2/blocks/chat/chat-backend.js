import ChatController from './chat-controller.js';
import { TOOL_INPUT, TOOL_STATE } from './constants.js';
import { traceChat } from '../shared/chat/turn-activity.js';

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
  constructor({
    onToolDone, onTurnStarted, onTurnProgress, onTurnCompleted, onUpdate,
  }) {
    traceChat('chat-backend.js.constructor: forwarding callbacks to ChatController');
    this._controller = new ChatController({
      onToolDone,
      onTurnStarted,
      onTurnProgress,
      onTurnCompleted,
      onUpdate: (payload) => onUpdate(this._normalize(payload)),
    });
  }

  _normalize(payload) {
    traceChat('chat-backend.js._normalize: adapting controller state for component');
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
    traceChat('chat-backend.js.setContext: forwarding context');
    this._controller.setContext(context);
  }

  connect(...args) {
    traceChat('chat-backend.js.connect: forwarding availability check');
    return this._controller.connect(...args);
  }

  loadInitialMessages() {
    traceChat('chat-backend.js.loadInitialMessages: forwarding history restoration');
    return this._controller.loadInitialMessages();
  }

  sendMessage(...args) {
    traceChat('chat-backend.js.sendMessage: forwarding submission');
    return this._controller.sendMessage(...args);
  }

  approveToolCall = (...args) => {
    traceChat('chat-backend.js.approveToolCall: forwarding approval decision');
    return this._controller.approveToolCall(...args);
  };

  clear() {
    return this._controller.clear();
  }

  setMcpConfig(...args) {
    this._controller.setMcpConfig(...args);
  }

  stop() {
    traceChat('chat-backend.js.stop: forwarding interruption');
    this._controller.stop();
  }

  destroy() {
    this._controller.destroy();
  }
}

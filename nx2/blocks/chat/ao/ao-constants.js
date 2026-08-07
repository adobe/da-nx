/**
 * Agent Orchestrator (AO) wire vocabulary.
 *
 * This is AO's own contract (see https://aep-ao.pages.adobeitc.com/api-reference/spec/),
 * deliberately kept separate from ../constants.js — that file's AGENT_EVENT/TOOL_STATE/
 * PART_TYPE are da-agent's protocol, owned by da-nx + da-agent. AO and da-agent are
 * different backends with different lifecycles; nothing here should be renamed to match
 * da-agent's vocabulary, and nothing in da-agent's file should be imported here.
 */

// Server -> client event types (WebSocket message `type`).
export const AO_EVENT = {
  SESSION_READY: 'SESSION_READY',
  TEXT_DELTA: 'text_delta',
  TEXT_DONE: 'text_done',
  PERMISSION_REQUEST: 'permission_request',
  USER_QUESTION: 'user_question',
  PLAN_APPROVAL_REQUEST: 'plan_approval_request',
  UI_ARTIFACT_CREATED: 'ui_artifact_created',
  TURN_COMPLETED: 'turn_completed',
  TURN_ABORTED: 'turn_aborted',
  TURN_SUSPENDED: 'turn_suspended',
  ERROR_CONNECTION: 'ERROR',
  ERROR_SESSION: 'error',
};

// Client -> server frame types.
export const AO_FRAME = {
  AUTH: 'AUTH',
  USER_INPUT: 'USER_INPUT',
  INTERRUPT: 'INTERRUPT',
  PERMISSION_RESPONSE: 'PERMISSION_RESPONSE',
  QUESTION_RESPONSE: 'QUESTION_RESPONSE',
  RESUME: 'RESUME',
};

// Lifecycle state AO's controller tracks per pending_call/tool. Local to AO —
// translated into the neutral card-renderers.js display shape at the controller
// boundary, never compared against by shared rendering code.
export const AO_TOOL_STATE = {
  APPROVAL_REQUESTED: 'approval-requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

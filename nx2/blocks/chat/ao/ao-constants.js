/**
 * Agent Orchestrator (AO) wire vocabulary.
 *
 * This is AO's own contract (see https://aep-ao.pages.adobeitc.com/api-reference/spec/),
 * deliberately kept separate from ../constants.js — that file's AGENT_EVENT/TOOL_STATE/
 * PART_TYPE are da-agent's protocol, owned by da-nx + da-agent. AO and da-agent are
 * different backends with different lifecycles; nothing here should be renamed to match
 * da-agent's vocabulary, and nothing in da-agent's file should be imported here.
 *
 * The event/frame names shared with nx-chat-ao are imported from its ao-constants.js
 * rather than re-typed, so there's one source of truth for what AO actually calls them
 * on the wire — only the names this file's own (not-yet-moved) capabilities need are
 * added locally.
 */
import { AO_EVENT as SHARED_AO_EVENT, AO_FRAME as SHARED_AO_FRAME } from '../../chat-ao/ao-constants.js';

// Server -> client event types (WebSocket message `type`).
export const AO_EVENT = {
  ...SHARED_AO_EVENT,
  PERMISSION_REQUEST: 'permission_request',
  PLAN_APPROVAL_REQUEST: 'plan_approval_request',
  UI_ARTIFACT_CREATED: 'ui_artifact_created',
  TURN_SUSPENDED: 'turn_suspended',
};

// Client -> server frame types.
export const AO_FRAME = {
  ...SHARED_AO_FRAME,
  PERMISSION_RESPONSE: 'PERMISSION_RESPONSE',
};

// Lifecycle state AO's controller tracks per pending_call/tool. Local to AO —
// translated into the neutral card-renderers.js display shape at the controller
// boundary, never compared against by shared rendering code.
export const AO_TOOL_STATE = {
  APPROVAL_REQUESTED: 'approval-requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

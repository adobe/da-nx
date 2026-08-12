const ADOBE_AI_GUIDELINES_URL = 'https://www.adobe.com/legal/licenses-terms/adobe-dx-gen-ai-user-guidelines.html';

const MENU_OPTIONS = {
  PROMPT: 'prompt',
  COMMAND: 'command',
  FILES: 'files',
};

const ADD_MENU_ITEMS = [
  { section: 'Add' },
  { id: MENU_OPTIONS.FILES, label: 'Files or images', icon: 'link' },
  { id: MENU_OPTIONS.PROMPT, label: 'Prompt', icon: 'commentremove' },
  { id: MENU_OPTIONS.COMMAND, label: '"/" Command', icon: 'prompt' },
  { divider: true },
  { id: 'prompts', label: 'Manage Prompts' },
  { id: 'skills', label: 'Manage Skills' },
];

/**
 * Agent stream event types (v2 approval protocol — see docs/approval-protocol.md §5).
 * This wire contract is owned by da-nx + da-agent; it is not the AI SDK's format.
 */
const AGENT_EVENT = {
  TEXT_DELTA: 'text-delta',
  TEXT_END: 'text-end',
  FINISH: 'finish',
  FINISH_MESSAGE: 'finish-message',
  ERROR: 'error',
  // A tool call the agent wants to make.
  TOOL_INPUT_AVAILABLE: 'tool-input-available',
  // Emitted for a tool call that requires user approval before it runs.
  TOOL_APPROVAL_REQUEST: 'tool-approval-request',
  // Result of an executed tool.
  TOOL_OUTPUT_AVAILABLE: 'tool-output-available',
  TOOL_OUTPUT_ERROR: 'tool-output-error',
};

/**
 * Message content part types (v2). Assistant `content` is either a plain string
 * (chat text) or an array of these parts.
 */
const PART_TYPE = {
  TEXT: 'text',
  TOOL: 'tool',
};

/**
 * Lifecycle state carried on a `type: 'tool'` part — the single key the server
 * reconciles on (see docs/approval-protocol.md §4). Also used as the UI card
 * state and as the `tool-card-${state}` CSS class.
 */
const TOOL_STATE = {
  INPUT_AVAILABLE: 'input-available',
  AWAITING_APPROVAL: 'awaiting-approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  OUTPUT_AVAILABLE: 'output-available',
  OUTPUT_ERROR: 'output-error',
};

/**
 * Tool names emitted by da-agent — part of the agent-client contract.
 * TODO: move to @da/agent-types once the agent team can publish one.
 */
const TOOL_NAME = {
  CONTENT_CREATE: 'content_create',
  CONTENT_DELETE: 'content_delete',
  CONTENT_COPY: 'content_copy',
  CONTENT_MOVE: 'content_move',
  CONTENT_UPDATE: 'content_update',
  CONTENT_UPLOAD: 'content_upload',
};

/**
 * Input field names used in tool approval summary rendering.
 * These are da-agent tool input schema field names — part of the agent-client contract.
 * TODO: move to @da/agent-types once the agent team can publish one.
 */
const TOOL_INPUT = {
  HUMAN_READABLE_SUMMARY: 'humanReadableSummary',
  SOURCE_PATH: 'sourcePath',
  DESTINATION_PATH: 'destinationPath',
  PATH: 'path',
  SKILL_ID: 'skillId',
  NAME: 'name',
};

const TOOL_SCOPE = {
  [TOOL_NAME.CONTENT_CREATE]: 'file',
  [TOOL_NAME.CONTENT_DELETE]: 'file',
  [TOOL_NAME.CONTENT_COPY]: 'file',
  [TOOL_NAME.CONTENT_MOVE]: 'file',
  [TOOL_NAME.CONTENT_UPDATE]: 'document',
  [TOOL_NAME.CONTENT_UPLOAD]: 'document',
};

const ROLE = {
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
};

export {
  ADOBE_AI_GUIDELINES_URL,
  ADD_MENU_ITEMS,
  AGENT_EVENT,
  MENU_OPTIONS,
  PART_TYPE,
  ROLE,
  TOOL_INPUT,
  TOOL_NAME,
  TOOL_SCOPE,
  TOOL_STATE,
};

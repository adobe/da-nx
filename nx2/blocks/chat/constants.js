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
 * Agent stream event types.
 * Source: Vercel AI SDK v6 UIMessageStream format, as emitted by da-agent.
 * TODO: move to a shared @da/agent-types package so both sides import from one place.
 */
const AGENT_EVENT = {
  TEXT_DELTA: 'text-delta',
  TEXT_END: 'text-end',
  FINISH: 'finish',
  FINISH_MESSAGE: 'finish-message',
  ERROR: 'error',
  // tool-input-available is the legacy alias for tool-call
  TOOL_CALL: 'tool-call',
  TOOL_CALL_LEGACY: 'tool-input-available',
  // tool-output-available is the legacy alias for tool-result
  TOOL_RESULT: 'tool-result',
  TOOL_RESULT_LEGACY: 'tool-output-available',
  TOOL_APPROVAL_REQUEST: 'tool-approval-request',
  TOOL_APPROVAL_RESPONSE: 'tool-approval-response',
};

const TOOL_STATE = {
  RUNNING: 'running',
  APPROVAL_REQUESTED: 'approval-requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DONE: 'done',
  ERROR: 'error',
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
  ROLE,
  TOOL_INPUT,
  TOOL_NAME,
  TOOL_SCOPE,
  TOOL_STATE,
};

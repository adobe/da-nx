/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

export const AO_WS_BASE = 'wss://agent-orchestrator-prod-va7.adobe.io';

export const AO_HTTP_BASE = 'https://agent-orchestrator-prod-va7.adobe.io';

export const AO_MANIFEST_ID = 'experience-workspace';

// Mirrors AO's own server-side allowlist
export const AO_UPLOAD_EXTENSIONS = [
  '.pdf', '.txt', '.md', '.docx', '.pptx',
  '.zip', '.tar', '.tgz', '.tar.gz',
  '.csv', '.xlsx', '.json', '.yaml', '.yml', '.xml', '.toml',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.html', '.css', '.js', '.ts', '.tsx', '.jsx',
  '.py', '.java', '.kt', '.go', '.rs', '.cpp', '.c', '.h', '.cs', '.rb', '.sh', '.sql', '.r', '.swift', '.scala',
];

// AO's per-file size limit (filesystem/quotas.py's _SINGLE_FILE_LIMIT).
export const AO_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export const COWORKER_SKILLS_URL = 'https://coworker.experience.adobe.io/skills';

export const ADD_MENU_ITEMS = [
  { section: 'Add' },
  { id: 'files', label: 'Files or images', icon: 'link' },
  { divider: true },
  { id: 'skills', label: 'Manage Skills' },
];

export const AO_FRAME = {
  AUTH: 'AUTH',
  USER_INPUT: 'USER_INPUT',
  INTERRUPT: 'INTERRUPT',
  QUESTION_RESPONSE: 'QUESTION_RESPONSE',
  RESUME: 'RESUME',
  ATTACH: 'ATTACH',
};

export const AO_EVENT = {
  SESSION_READY: 'SESSION_READY',
  TEXT_DELTA: 'text_delta',
  TEXT_DONE: 'text_done',
  TURN_COMPLETED: 'turn_completed',
  TURN_ABORTED: 'turn_aborted',
  ERROR_CONNECTION: 'ERROR',
  ERROR_SESSION: 'error',
  EPISODE_TITLE_UPDATED: 'episode_title_updated',
  USER_QUESTION: 'user_question',
  PLAN_APPROVAL_REQUEST: 'plan_approval_request',
  UI_ARTIFACT_CREATED: 'ui_artifact_created',
  TOOL_CALL_DETECTED: 'tool_call_detected',
  TOOL_CALL_START: 'tool_call_start',
  TOOL_CALL_END: 'tool_call_end',
};

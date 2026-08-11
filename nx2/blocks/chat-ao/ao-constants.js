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

const AO_REGION = 'va7';

export const AO_WS_BASE = {
  prod: `wss://agent-orchestrator-prod-${AO_REGION}.adobe.io`,
  stage: `wss://agent-orchestrator-stage-${AO_REGION}.adobe.io`,
};

export const AO_MANIFEST_ID = 'experience-workspace';

export const AO_FRAME = {
  AUTH: 'AUTH',
  USER_INPUT: 'USER_INPUT',
  INTERRUPT: 'INTERRUPT',
};

export const AO_EVENT = {
  SESSION_READY: 'SESSION_READY',
  TEXT_DELTA: 'text_delta',
  TEXT_DONE: 'text_done',
  TURN_COMPLETED: 'turn_completed',
  TURN_ABORTED: 'turn_aborted',
  ERROR_CONNECTION: 'ERROR',
  ERROR_SESSION: 'error',
};

export const ROLE = {
  USER: 'user',
  ASSISTANT: 'assistant',
};

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

const line = (prefix, value) => (value ? [`${prefix}${value}`] : []);

export function buildSuggestionPrompt({ item, aligned }) {
  const suggestion = item?.suggestion ?? {};
  const reason = suggestion.issue ?? item?.description;
  const { category, description: contextDescription } = suggestion.context ?? {};
  const alignment = aligned === undefined ? undefined : (aligned && 'Yes') || 'No';
  return [
    'Apply this brand guideline suggestion to the page I have open.',
    ...line('Check: ', item?.title),
    ...line('Alignment: ', alignment),
    ...line('Asset: ', suggestion.assetLabel ?? suggestion.label),
    ...line('Category: ', category),
    ...line('Reason: ', reason),
    ...line('Context: ', contextDescription !== reason ? contextDescription : undefined),
    ...line('Suggestion: ', suggestion.suggested),
    'Only change what this suggestion covers; leave the rest of the page unchanged.',
  ].join('\n');
}

export async function sendSuggestionToChat({ text, autoSend = false }) {
  const { CHAT_EVENT } = await import('../../../utils/chat.js');
  document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, { detail: { text, autoSend } }));
}

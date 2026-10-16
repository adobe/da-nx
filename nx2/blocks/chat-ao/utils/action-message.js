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

// See docs/chat-ao-component.md#action-messages. An "action message" is a normal user message
// whose first line is a short title and whose long instruction sits behind a marker line:
//
//   Hero failure: Generate suggestion
//   <!--nx:details-->
//   /aem-governance-element-suggestions
//   ...
//
// The agent receives the whole text; the chat bubble shows only the title, with the body
// collapsed. It is a pure function of the stored text, so it works the same after a reload,
// and clients that don't know the convention just show the text.
export const DETAILS_MARKER = '<!--nx:details-->';

/**
 * @returns {{ title: string, body: string, prefix: string } | null} `prefix` is whatever
 * precedes the title (for example an attachments block), or '' when there is none.
 */
export function parseActionMessage(content) {
  if (typeof content !== 'string' || !content.includes(DETAILS_MARKER)) return null;
  const lines = content.split('\n');
  const at = lines.findIndex((line, i) => i > 0 && line.trim() === DETAILS_MARKER);
  if (at < 1) return null;
  const title = lines[at - 1].trim();
  if (!title) return null;
  return {
    title,
    body: lines.slice(at + 1).join('\n').trim(),
    prefix: lines.slice(0, at - 1).join('\n').trim(),
  };
}

/** Inverse of `parseActionMessage`. The title is forced onto one line. */
export function buildActionMessage({ title, body }) {
  const oneLine = String(title ?? '').replace(/\s+/g, ' ').trim();
  return [oneLine, DETAILS_MARKER, body ?? ''].join('\n');
}

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

/**
 * Finds the title of a ProseMirror document, which is the text of its first `h1`.
 *
 * @param {object} document - A ProseMirror document node.
 * @returns {string} The title, or an empty string when there is no `h1`.
 */
function getTitleFromDocument(document) {
  let title = '';
  document.descendants((node) => {
    if (node.type.name === 'heading' && node.attrs.level === 1 && !title) {
      title = node.textContent;
    }
    return !title;
  });
  return title;
}

/**
 * Builds the Content Advisor prompt from a page title and its plain text.
 *
 * @param {object} options
 * @param {string} options.title - The page title, or an empty string.
 * @param {string} options.text - The plain text of the page.
 * @returns {string} The prompt.
 */
function createPrompt({ title, text }) {
  return `The user is looking for assets that match a web page with the following content:

  ${title ? `Title: ${title}` : ''}

  ${text}

  Please suggest Assets that are visually appealing and relevant to the subject.`;
}

/**
 * Builds the Content Advisor brief for the AEM Asset Selector from the
 * current page, so the advisor can recommend assets relevant to it.
 *
 * @param {object} document - A ProseMirror document node.
 * @returns {string} The brief, or an empty string when the page has no text.
 */
export function formatExternalBrief(document) {
  const contentPlainText = document.textContent;
  if (!contentPlainText) return '';

  const title = getTitleFromDocument(document);
  return createPrompt({ title, text: contentPlainText });
}

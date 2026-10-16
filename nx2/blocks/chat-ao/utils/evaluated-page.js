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

// A page-evaluation artifact doesn't say which page it evaluated, so chat-ao takes it from the
// user message that asked for it. See
// docs/evaluation-findings.md#a-newer-evaluation-replaces-the-old-card.

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;
const LABELLED_RE = /Evaluated URL:\s*(https?:\/\/[^\s<>"')\]]+)/i;
// <ref>--<site>--<org>.aem.page / .aem.live / .hlx.page / .hlx.live / .preview.da.live /
// .live.da.live
const EDS_HOST_RE = new RegExp([
  '^[^.]+--([^.]+)--([^.]+)\\.(?:aem|hlx)\\.(?:page|live)$',
  '^[^.]+--([^.]+)--([^.]+)\\.(?:preview|live)\\.da\\.live$',
].join('|'));

const cleanPath = (path) => `/${path.split('/').filter(Boolean).join('/')}`
  .replace(/\.(?:html|md)$/, '')
  .replace(/\/index$/, '')
  || '/';

/**
 * Identity of a page across its editor, preview and live URLs: `org/site/path`
 * (without `.html`, a trailing slash or `/index`). Other hosts: `host/path`.
 * @returns {string} '' for anything that isn't a URL.
 */
export function pageIdentity(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return '';
  }
  if (url.hostname === 'da.live' && /^#\/[^/]+\/[^/]+/.test(url.hash)) {
    const [org, site, ...rest] = url.hash.slice(2).split('/');
    return `${org}/${site}${cleanPath(rest.join('/'))}`.replace(/\/$/, '');
  }
  const eds = EDS_HOST_RE.exec(url.hostname);
  if (eds) {
    const site = eds[1] ?? eds[3];
    const org = eds[2] ?? eds[4];
    return `${org}/${site}${cleanPath(url.pathname)}`.replace(/\/$/, '');
  }
  return `${url.hostname}${cleanPath(url.pathname)}`.replace(/\/$/, '');
}

/**
 * The page a user message is about: its "Evaluated URL:" line, else its first URL.
 * @returns {{ href: string, key: string } | null}
 */
export function pageOfMessage(content) {
  if (typeof content !== 'string') return null;
  const found = LABELLED_RE.exec(content)?.[1] ?? URL_RE.exec(content)?.[0];
  const href = found?.replace(/[.,;]+$/, '');
  const key = href ? pageIdentity(href) : '';
  return key ? { href, key } : null;
}

/**
 * For every message, the page of the nearest user message before it that names one.
 * @returns {Array<{ href: string, key: string } | null>} aligned with `messages`.
 */
export function evaluatedPages(messages) {
  let current = null;
  return (messages ?? []).map((msg) => {
    if (msg.role === 'user') current = pageOfMessage(msg.content) ?? current;
    return current;
  });
}

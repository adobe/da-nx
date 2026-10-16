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

import { buildActionMessage } from '../utils/action-message.js';

// "Generate suggestion" for one failing page element.
// See docs/evaluation-findings.md#generate-suggestion.

const SKILL_TOKEN = '/aem-governance-element-suggestions';
const PAGE_KEY = 'el-page';

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const isNone = (text) => !text || /^n\/?a$/i.test(String(text).trim());

/** Failing elements can get a suggestion; the "Whole page" group and unfixable groups can't. */
export function canSuggest(section) {
  return section?.key !== PAGE_KEY
    && !/^whole page$/i.test(section?.label ?? '')
    && (section?.items ?? []).some((item) => item.suggestion);
}

/**
 * Short element name for the chat bubble, from an outline label such as
 * "Section 1 › cards (tiles) — Heading 5: “Bundles”" ⇒ "Cards (tiles) heading 5".
 * "Hero" stays "Hero"; "Section 1 › Default content — Heading 1" ⇒ "Heading 1".
 */
export function shortElementName(label) {
  const text = String(label ?? '').replace(/\s*:\s*[“"‘'].*$/, '').trim();
  const [location, kind] = text.split(/\s+[—–]\s+/).map((part) => part.trim());
  const block = (location ?? '').split('›').pop().trim();
  const generic = !block || /^default content$/i.test(block);
  if (!kind) return capitalise(block || 'Element');
  if (generic) return capitalise(kind);
  if (kind.toLowerCase() === block.toLowerCase()) return capitalise(block);
  return `${capitalise(block)} ${kind.toLowerCase()}`;
}

/** The `EvalGroup` of `EVAL_EVENT.SUGGEST_ELEMENT`: one failing element and its failing checks. */
export function toEvalGroup({ section, findings }) {
  return {
    key: section.key,
    label: section.label ?? '',
    name: shortElementName(section.label),
    findings,
  };
}

export const suggestTitle = (name) => `${name} failure: Generate suggestion`;

const quote = (text) => `"${String(text).replace(/\s+/g, ' ').trim()}"`;

function locateLines(findings) {
  const evidence = findings.flatMap((f) => f.evidence ?? []);
  const image = evidence.find((e) => e?.anchorType === 'image' && e.src);
  const text = evidence.find((e) => e?.anchorType === 'text' && e.anchorText);
  if (image && !text) {
    const file = String(image.src).split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? image.src;
    return ['Element: image', `Locate: image ${file}, occurrence ${image.occurrence ?? 1}`];
  }
  if (!text) return [];
  const lead = text.highlightOnly ? 'Text starts with' : 'Current text';
  return [
    `Locate: text ${quote(text.anchorText)}, occurrence ${text.occurrence ?? 1}`,
    `${lead}: ${quote(text.anchorText)} (excerpt: read the element with da_get_source for the full text)`,
  ];
}

function checkLine(finding, index) {
  const explanation = finding.issue ?? finding.description ?? '';
  const hint = isNone(finding.suggested) ? '' : ` Hint: ${quote(finding.suggested)}`;
  const stop = /[.!?]$/.test(explanation.trim()) ? '' : '.';
  return `${index + 1}. ${finding.title}${explanation ? ` — ${explanation}${stop}` : ''}${hint}`;
}

/**
 * The plain request sent when no host claimed SUGGEST_ELEMENT. It only knows what the
 * artifact carries (an excerpt of the text, not the full text, links or formatting).
 */
export function buildFallbackMessage({ group, evaluatedUrl }) {
  const { findings } = group;
  const body = [
    SKILL_TOKEN,
    ...(evaluatedUrl ? [`Evaluated URL: ${evaluatedUrl}`] : []),
    `Element: ${group.label}`,
    ...locateLines(findings),
    `Failing checks (${findings.length}):`,
    ...findings.map(checkLine),
    'Constraints: same language and element kind; keep names, prices, numbers and links.',
    'Give 3 options, each fixing ALL failing checks.',
  ];
  return buildActionMessage({ title: suggestTitle(group.name), body: body.join('\n') });
}

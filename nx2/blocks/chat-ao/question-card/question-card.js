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

import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../../styles/buttons.css', import.meta.url).href);

// Sentinel for "the answer is whatever's typed in this question's free-text
// field" — never sent over the wire itself, always swapped for the typed
// text (see _answerFor).
const OTHER = '__other__';

// AO's ask_user_question tool call, rendered as-is — this is the only shape AO
// sends for a "should I proceed?" pause today (no separate permission-request
// concept has shown up in practice).
//
// "Other" gets a real radio/checkbox in the *same* native group as the fixed
// options — that's what makes Tab/Arrow-keys/Space/Enter work identically
// for every option, with no custom nav code. The one thing that radio's own
// change handler must NOT do is jump focus into its paired text field:
// arrow-key movement in a native radiogroup always both moves *and* selects,
// so auto-focusing the text field on selection meant arrowing onto "Other"
// (even just passing through) yanked focus out of the group entirely,
// trapping keyboard users there. Reaching the text field to actually type is
// one more Tab press — the same as moving between any two distinct native
// controls — and only *typing* in it (not merely focusing/tabbing through)
// marks it as the chosen answer, so passing through never hijacks a pick.
class NxQuestionCard extends LitElement {
  static properties = {
    pending: { attribute: false },
    _selections: { state: true },
    _otherTexts: { state: true },
  };

  constructor() {
    super();
    this._selections = new Map();
    this._otherTexts = new Map();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles, buttonStyle];
  }

  willUpdate(changed) {
    if (changed.has('pending')) {
      this._selections = new Map();
      this._otherTexts = new Map();
    }
  }

  updated(changed) {
    if (changed.has('pending') && this.pending) this._focusFirst();
  }

  _focusFirst() {
    const firstQuestion = this.pending?.questions?.[0];
    if (!firstQuestion) return;
    if ((firstQuestion.options ?? []).length === 0) {
      this.shadowRoot.querySelector('.question-other-input')?.focus();
      return;
    }
    this.shadowRoot.querySelector('input[type="radio"], input[type="checkbox"]')?.focus();
  }

  _answerFor(question) {
    const selected = this._selections.get(question.id) ?? new Set();
    const answer = [];
    selected.forEach((value) => {
      if (value !== OTHER) {
        answer.push(value);
        return;
      }
      const text = (this._otherTexts.get(question.id) ?? '').trim();
      if (text) answer.push(text);
    });
    return answer;
  }

  get _canSubmit() {
    return (this.pending?.questions ?? [])
      .every((q) => !q.required || this._answerFor(q).length > 0);
  }

  _toggle(question, value) {
    const next = new Map(this._selections);
    const current = new Set(next.get(question.id));
    if (question.multi_select) {
      if (current.has(value)) current.delete(value);
      else current.add(value);
    } else {
      current.clear();
      current.add(value);
    }
    next.set(question.id, current);
    this._selections = next;
  }

  // Radio/checkbox inputs only toggle on Space natively — Enter is a no-op
  // for them (unlike the free-text field, where Enter submits the form).
  // Wiring Enter to do the same thing Space already does keeps every option
  // in the row responding to the same key — and since Enter is a deliberate
  // "I'm done" keypress rather than the arrow-key browsing that both moves
  // and selects as a side effect, it also submits once that choice is enough
  // to satisfy every required question (e.g. picking the one answer to a
  // single-question approval submits immediately).
  _handleOptionKeydown(e, question, value) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    this._toggle(question, value);
    if (this._canSubmit) this._submit(e);
  }

  // Same as above, but Enter on "Other" also moves focus into its text field
  // when there's nothing typed yet to submit — there's no answer here until
  // the user actually types one.
  _handleOtherOptionKeydown(e, question) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    this._toggle(question, OTHER);
    if (this._canSubmit) this._submit(e);
    else e.target.nextElementSibling?.focus();
  }

  // Escape mirrors clicking Skip — a quick way to bail out of the whole
  // question from anywhere in the card, not just the Skip button itself.
  _handleFormKeydown(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    this._decline();
  }

  // Typing is the only thing that selects "Other" — never merely focusing or
  // tabbing through it — so passing through on the way to Submit never
  // clobbers a fixed pick, and this keeps the paired radio's checked state
  // (and thus the chip's highlight) in sync with whether there's real text.
  _handleOtherText(question, text) {
    this._otherTexts = new Map(this._otherTexts).set(question.id, text);
    const next = new Map(this._selections);
    const current = new Set(next.get(question.id));
    if (question.multi_select) {
      if (text.trim()) current.add(OTHER);
      else current.delete(OTHER);
    } else if (text.trim()) {
      current.clear();
      current.add(OTHER);
    } else {
      current.delete(OTHER);
    }
    next.set(question.id, current);
    this._selections = next;
  }

  _submit(e) {
    e.preventDefault();
    if (!this._canSubmit) return;
    const answers = this.pending.questions.map((q) => ({
      question_id: q.id,
      selected_options: this._answerFor(q),
    }));
    this.onSubmit?.(answers);
  }

  _decline() {
    this.onDecline?.();
  }

  render() {
    if (!this.pending) return nothing;
    const { context, questions } = this.pending;
    return html`
      <form class="question-card" @submit=${this._submit} @keydown=${this._handleFormKeydown}>
        ${context ? html`<p class="question-context">${context}</p>` : nothing}
        ${questions.map((q) => {
      const hasOptions = (q.options ?? []).length > 0;
      return html`
          <fieldset class="question-fieldset">
            <legend class="question-header">${q.header}</legend>
            <p class="question-text">${q.question}</p>
            <div class="question-options">
              ${(q.options ?? []).map((opt) => html`
                <label class="question-option">
                  <input
                    type=${q.multi_select ? 'checkbox' : 'radio'}
                    name="question-${q.id}"
                    .checked=${this._selections.get(q.id)?.has(opt.label) ?? false}
                    @change=${() => this._toggle(q, opt.label)}
                    @keydown=${(e) => this._handleOptionKeydown(e, q, opt.label)}
                  />
                  <span class="question-option-text">
                    <span class="question-option-label">${opt.label}</span>
                    ${opt.description ? html`<span class="question-option-desc">${opt.description}</span>` : nothing}
                  </span>
                </label>
              `)}
              <div class="question-option">
                <input
                  type=${q.multi_select ? 'checkbox' : 'radio'}
                  name="question-${q.id}"
                  aria-label="Custom answer"
                  .checked=${this._selections.get(q.id)?.has(OTHER) ?? false}
                  @change=${() => this._toggle(q, OTHER)}
                  @keydown=${(e) => this._handleOtherOptionKeydown(e, q)}
                />
                <input
                  type="text"
                  class="question-other-input"
                  tabindex="-1"
                  placeholder=${hasOptions ? 'Something else...' : 'Your answer'}
                  .value=${this._otherTexts.get(q.id) ?? ''}
                  @input=${(e) => this._handleOtherText(q, e.target.value)}
                />
              </div>
            </div>
          </fieldset>
        `;
    })}
        <div class="question-actions">
          <button type="button" class="nx-action-btn nx-btn-sm" @click=${this._decline}>Skip</button>
          <button type="submit" class="nx-btn-primary nx-btn-sm" ?disabled=${!this._canSubmit}>Submit</button>
        </div>
      </form>
    `;
  }
}

if (!customElements.get('nx-question-card')) customElements.define('nx-question-card', NxQuestionCard);

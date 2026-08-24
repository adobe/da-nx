import { html, nothing } from 'da-lit';
import { renderMessageContent } from '../renderers/renderers.js';

/**
 * Rendering for AO-only concepts that have no da-agent equivalent: a2ui
 * artifacts. Nothing here is a variant of an existing renderers.js function —
 * these are a genuinely new UI surface, so unlike card-renderers.js this
 * module isn't a migration target for da-agent's rendering, just AO's own.
 */

// Some AO payloads (e.g. user_question context) arrive with literal backslash-n
// sequences instead of real newlines, which remark renders as visible "\n" text
// rather than paragraph/list breaks. Normalize before parsing. Scoped to AO's own
// text fields rather than fixed in the shared renderMessageContent, since this is
// a quirk of AO's payloads, not a general markdown-rendering concern.
function unescapeLiteralNewlines(text) {
  return text.replace(/\\r\\n|\\n/g, '\n');
}

function renderAoMarkdown(text) {
  return renderMessageContent(unescapeLiteralNewlines(text ?? ''));
}

function renderDataTable({ columns = [], data = [] } = {}) {
  return html`
    <div class="ui-artifact-table-wrapper">
      <table class="ui-artifact-table">
        <thead>
          <tr>${columns.map((col) => html`<th>${col.label ?? col.key}</th>`)}</tr>
        </thead>
        <tbody>
          ${data.map((row) => html`
            <tr>${columns.map((col) => html`<td>${row[col.key] ?? ''}</td>`)}</tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
}

// Plan cards (surface_id "sample-plan-card" today) arrive as a single Markdown
// component — reuse the same markdown pipeline as regular assistant text so
// headings/lists/checklists render the same way, inside a bordered card to set
// it apart from a plain chat bubble.
function renderMarkdownArtifact({ content = '' } = {}) {
  return html`
    <div class="ui-artifact-markdown">
      <div class="message-content">${renderAoMarkdown(content)}</div>
    </div>
  `;
}

// Cross-surface component (also rendered as Teams AdaptiveCard chips by
// cx-surface's next_actions_card builder — same { prompts: [{ title, prompt }] }
// shape there). Clicking a chip sends its `prompt` through onSendPrompt, which
// chat.js wires to the same "send this text" path used by the prompt-shortcut popover.
function renderNextActionsCard({ prompts = [] } = {}, { onSendPrompt } = {}) {
  if (!prompts.length) return nothing;
  return html`
    <div class="ui-artifact-next-actions">
      <span class="ui-artifact-next-actions-header">Next, would you like to:</span>
      ${prompts.map(({ title, prompt }) => html`
        <button type="button" class="ui-artifact-next-action-chip"
          @click=${() => onSendPrompt?.(prompt)}
        >${title || prompt}</button>
      `)}
    </div>
  `;
}

// Registry of a2ui component types we know how to render. Add to this as we encounter
// (and choose to support) new ones — anything not listed here falls back to the
// artifact's own text_fallback instead of being silently dropped.
const UI_ARTIFACT_RENDERERS = {
  DataTable: renderDataTable,
  Markdown: renderMarkdownArtifact,
  NextActionsCard: renderNextActionsCard,
};

function renderUiArtifactComponent(component, fallbackText, onSendPrompt) {
  const renderer = UI_ARTIFACT_RENDERERS[component.type];
  if (renderer) return renderer(component.props, { onSendPrompt });
  return html`<p class="ui-artifact-fallback">${fallbackText || `Unsupported content (${component.type}).`}</p>`;
}

export function renderUiArtifact(uiArtifact, onSendPrompt) {
  if (!uiArtifact) return nothing;
  const { components, textFallback, title } = uiArtifact;
  if (!components?.length) {
    return textFallback ? html`<p class="ui-artifact-fallback">${textFallback}</p>` : nothing;
  }
  return html`
    <div class="ui-artifact">
      ${title ? html`<span class="ui-artifact-title">${title}</span>` : nothing}
      ${components.map((c) => renderUiArtifactComponent(c, textFallback, onSendPrompt))}
    </div>
  `;
}

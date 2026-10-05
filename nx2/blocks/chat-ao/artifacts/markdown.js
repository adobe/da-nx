import { html } from 'da-lit';
import { registerArtifact } from './registry.js';
import { renderMarkdown, unescapeLiteralNewlines } from '../utils/markdown.js';

// Reuses the same markdown pipeline as plain assistant text, wrapped in a card.
registerArtifact('Markdown', ({ content = '' }) => html`
  <div class="ui-artifact-markdown">
    <div class="message-content">${renderMarkdown(unescapeLiteralNewlines(content))}</div>
  </div>
`);

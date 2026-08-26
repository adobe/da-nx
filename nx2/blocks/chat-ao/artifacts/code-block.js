import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';
import { renderCopyButton } from '../../shared/chat/copy-button.js';

registerArtifact('CodeBlock', ({ code, content, language }) => {
  const text = code ?? content ?? '';
  return html`
    <div class="code-block">
      <div class="code-block-header">
        ${language ? html`<span class="code-block-lang">${language}</span>` : nothing}
        ${renderCopyButton(text)}
      </div>
      <pre><code>${text}</code></pre>
    </div>
  `;
});

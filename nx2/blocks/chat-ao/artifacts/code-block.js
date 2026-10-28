import { html, nothing, until } from 'da-lit';
import { registerArtifact } from './registry.js';
import { renderCopyButton } from '../../shared/chat/copy-button.js';
import { tokenizeCode } from './utils/code-block.js';

function renderTokens(token) {
  if (typeof token === 'string') return token;
  if (Array.isArray(token)) return token.map(renderTokens);
  const aliases = Array.isArray(token.alias) ? token.alias : [token.alias];
  const classes = ['token', token.type, ...aliases].filter(Boolean).join(' ');
  return html`<span class=${classes}>${renderTokens(token.content)}</span>`;
}

const highlightCode = (() => {
  const cache = new Map();
  return ({ text, language }) => {
    const key = JSON.stringify([language.trim().toLowerCase(), text]);
    if (cache.has(key)) {
      const highlighted = cache.get(key);
      cache.delete(key);
      cache.set(key, highlighted);
      return highlighted;
    }
    const highlighted = tokenizeCode({ text, language }).then((tokens) => {
      if (typeof tokens === 'string' && cache.get(key) === highlighted) cache.delete(key);
      return renderTokens(tokens);
    });
    cache.set(key, highlighted);
    if (cache.size > 16) cache.delete(cache.keys().next().value);
    return highlighted;
  };
})();

registerArtifact('CodeBlock', ({ code, content, language }) => {
  const text = code ?? content ?? '';
  if (typeof text !== 'string' || (language !== undefined && typeof language !== 'string')) {
    throw new Error('Unsupported CodeBlock content.');
  }
  const highlighted = text && language ? highlightCode({ text, language }) : text;
  return html`
    <div class="code-block">
      <div class="code-block-header">
        ${language ? html`<span class="code-block-lang">${language}</span>` : nothing}
        ${renderCopyButton(text)}
      </div>
      <pre><code>${until(highlighted, text)}</code></pre>
    </div>
  `;
});

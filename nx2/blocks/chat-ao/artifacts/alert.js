import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';

const KNOWN_SEVERITIES = new Set(['info', 'success', 'warning', 'error', 'critical']);

// AO's own reference Alert renderer aliases `severity`/`variant`; `level` is a
// third alias actually observed on the wire — LLM-authored props aren't
// guaranteed to match one exact key (see registry.js's renderArtifactNode).
function resolveTone(...values) {
  return values.find((v) => KNOWN_SEVERITIES.has(v)) ?? 'info';
}

registerArtifact('Alert', ({
  severity, level, variant, title, message, details, requiredAction,
}) => {
  const tone = resolveTone(severity, level, variant);
  return html`
    <div class="ui-artifact-alert ui-artifact-alert-${tone}">
      <span class="ui-artifact-alert-icon"></span>
      <div class="ui-artifact-alert-body">
        <p class="ui-artifact-alert-text">${title ? html`<strong>${title}</strong> ` : nothing}${message}</p>
        ${details ? html`<p class="ui-artifact-alert-details">${details}</p>` : nothing}
        ${requiredAction ? html`<p class="ui-artifact-alert-action">${requiredAction}</p>` : nothing}
      </div>
    </div>
  `;
});

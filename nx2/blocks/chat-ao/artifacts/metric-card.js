import { html, nothing } from 'da-lit';
import { registerArtifact } from './registry.js';

const TREND_ICON = { up: '↑', down: '↓', flat: '→' };

registerArtifact('MetricCard', ({
  label = '', value = '', trend, change, tone,
}) => html`
  <div class="ui-artifact-metric${tone ? ` ui-artifact-metric-${tone}` : ''}">
    <span class="ui-artifact-metric-label">${label}</span>
    <div class="ui-artifact-metric-value-row">
      <span class="ui-artifact-metric-value">${value}</span>
      ${trend && change ? html`
        <span class="ui-artifact-metric-trend ui-artifact-metric-trend-${trend}">
          ${TREND_ICON[trend] ?? ''} ${change}
        </span>
      ` : nothing}
    </div>
  </div>
`);

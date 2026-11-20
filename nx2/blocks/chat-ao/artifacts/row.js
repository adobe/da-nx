import { html } from 'da-lit';
import { registerArtifact, renderChildren } from './registry.js';
import { layoutStyle } from './utils/layout.js';

registerArtifact('Row', ({ children, ...layout }, ctx) => html`
  <div class="ui-artifact-row" style=${layoutStyle(layout)}>${renderChildren(children, ctx)}</div>
`);

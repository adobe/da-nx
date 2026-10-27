import { html } from 'da-lit';
import { registerArtifact, renderChildren } from './registry.js';
import { getLayoutStyle } from './utils/layout.js';

registerArtifact('Row', ({ children, ...props }, ctx) => html`
  <div class="ui-artifact-row" style=${getLayoutStyle(props)}>${renderChildren(children, ctx)}</div>
`);

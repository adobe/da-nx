import { html } from 'da-lit';
import { registerArtifact, renderChildren } from './registry.js';
import { getLayoutStyle } from './utils/layout.js';

registerArtifact('Column', ({ children, ...props }, ctx) => html`
  <div class="ui-artifact-column" style=${getLayoutStyle(props)}>${renderChildren(children, ctx)}</div>
`);

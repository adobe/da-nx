import { html } from 'da-lit';
import { registerArtifact, renderChildren } from './registry.js';

registerArtifact('Column', ({ children }, ctx) => html`
  <div class="ui-artifact-column">${renderChildren(children, ctx)}</div>
`);

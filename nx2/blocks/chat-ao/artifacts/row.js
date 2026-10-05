import { html } from 'da-lit';
import { registerArtifact, renderChildren } from './registry.js';

registerArtifact('Row', ({ children }, ctx) => html`
  <div class="ui-artifact-row">${renderChildren(children, ctx)}</div>
`);

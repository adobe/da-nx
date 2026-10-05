import { html } from 'da-lit';
import { registerArtifact, renderChildren } from './registry.js';

registerArtifact('Card', ({ children }, ctx) => html`
  <div class="ui-artifact-card">${renderChildren(children, ctx)}</div>
`);

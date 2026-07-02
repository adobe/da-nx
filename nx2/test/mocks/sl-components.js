// Minimal test double for nx2/public/sl/components.js. Only registers the
// custom elements exercised by unit tests so far — extend as coverage grows.

class SlButton extends HTMLElement {}

if (!customElements.get('sl-button')) customElements.define('sl-button', SlButton);

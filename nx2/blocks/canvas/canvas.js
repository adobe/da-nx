import { LitElement, html } from 'lit';
import { loadStyle } from '../../utils/utils.js';

const style = await loadStyle(import.meta.url);

class NxCanvas extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  handleResizeStart(event) {
    if (window.innerWidth < 900) return;
    this._dragging = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    this.classList.add('is-resizing');
  }

  handleResizeMove(event) {
    if (!this._dragging) return;

    const shell = this.shadowRoot.querySelector('.canvas-shell');
    const { left, right } = shell.getBoundingClientRect();
    const width = Math.round(right - event.clientX);
    const minWidth = 320;
    const maxWidth = Math.min(560, Math.round((right - left) * 0.45));
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, width));

    this.style.setProperty('--canvas-chat-width', `${nextWidth}px`);
  }

  handleResizeEnd(event) {
    if (!this._dragging) return;
    this._dragging = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    this.classList.remove('is-resizing');
  }

  render() {
    return html`
      <div class="canvas-shell">
        <section class="workspace-pane" aria-label="Workspace canvas">
          <div class="workspace-pane-body">
            <div class="workspace-surface" aria-hidden="true"></div>
          </div>
        </section>

        <div
          class="panel-divider"
          aria-hidden="true"
          @pointerdown=${this.handleResizeStart}
          @pointermove=${this.handleResizeMove}
          @pointerup=${this.handleResizeEnd}
          @pointercancel=${this.handleResizeEnd}
        >
          <div class="panel-divider-handle"></div>
        </div>

        <aside class="chat-pane" aria-label="AI assistant panel">
          <div class="chat-pane-body">
            <div class="chat-surface" aria-hidden="true"></div>
          </div>
        </aside>
      </div>
    `;
  }
}

customElements.define('nx-canvas', NxCanvas);

export default function init(block) {
  const canvas = document.createElement('nx-canvas');
  block.replaceChildren(canvas);
}

import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { TASK_STATUS } from '../constants.js';

export { TASK_STATUS };

const styles = await loadStyle(import.meta.url);

/**
 * <nx-task-item> — single task row with icon + label + optional progress badge.
 *
 * Attributes / properties:
 *   status  {string}  'pending' | 'running' | 'done'
 *   label   {string}  Task description text
 *   current {number}  Current step index (1-based, shown when running)
 *   total   {number}  Total step count (shown when running)
 */
class NxTaskItem extends LitElement {
  static properties = {
    status: { type: String },
    label: { type: String },
    /** When present, label is clamped to a single line with ellipsis. */
    truncate: { type: Boolean, reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _renderIcon() {
    const { status = TASK_STATUS.PENDING } = this;
    if (status === TASK_STATUS.RUNNING) {
      return html`<span class="task-icon"><span class="task-icon-running" aria-hidden="true"></span></span>`;
    }
    if (status === TASK_STATUS.DONE) {
      return html`<span class="task-icon"><span class="task-icon-done" aria-label="Completed"></span></span>`;
    }
    return html`<span class="task-icon"><span class="task-icon-pending" aria-hidden="true"></span></span>`;
  }

  render() {
    const { status = TASK_STATUS.PENDING, label = '' } = this;
    const isDone = status === TASK_STATUS.DONE;

    return html`
      ${this._renderIcon()}
      <span class="task-label ${isDone ? 'task-label-done' : ''}">${label}</span>
    `;
  }
}

customElements.define('nx-task-item', NxTaskItem);

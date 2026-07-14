import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { TASK_STATUS } from '../constants.js';
import './task-item.js';

const styles = await loadStyle(import.meta.url);

/**
 * <nx-task-list> — flat list of task items without a card wrapper.
 * Used when the agent streams a task list outside of a full campaign plan.
 *
 * Properties:
 *   tasks {Array<{ id, label, status }>}
 */
class NxTaskList extends LitElement {
  static properties = {
    tasks: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  render() {
    const tasks = this.tasks ?? [];
    return html`
      ${tasks.map((task) => html`
        <nx-task-item
          truncate
          status=${task.status ?? TASK_STATUS.PENDING}
          label=${task.label ?? ''}
        ></nx-task-item>
      `)}
    `;
  }
}

customElements.define('nx-task-list', NxTaskList);

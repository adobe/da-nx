import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { getConfig } from '../../../scripts/nx.js';
import { PLAN_RUN_EVENT, TASK_STATUS } from '../constants.js';
import './task-item.js';

const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

const icon = (name, className) => html`<svg class=${className} viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${name}.svg#icon"></use></svg>`;

/**
 * <nx-campaign-plan-card> — Content Generation Plan card.
 *
 * Properties:
 *   plan {Object}
 *     title       {string}   Plan title
 *     description {string}   Short description / subtitle
 *     tasks       {Array<{ id, label, status }>}
 *
 * Events dispatched (bubbles + composed):
 *   nx-plan-run — user clicked Run
 */
class NxCampaignPlanCard extends LitElement {
  static properties = {
    plan: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _dispatch(eventName) {
    this.dispatchEvent(new CustomEvent(eventName, {
      bubbles: true, composed: true, detail: { plan: this.plan },
    }));
  }

  _findRunningTask(tasks) {
    const runningIdx = tasks.findIndex((t) => t.status === TASK_STATUS.RUNNING);
    return runningIdx >= 0 ? { task: tasks[runningIdx], current: runningIdx + 1 } : null;
  }

  _renderTasksFull(tasks) {
    return html`
      <div class="plan-tasks">
        <div class="plan-tasks-header">${tasks.length} Tasks to execute</div>
        ${tasks.map((task) => html`
          <div class="plan-task-row">
            <nx-task-item
              status=${task.status ?? TASK_STATUS.PENDING}
              label=${task.label ?? ''}
            ></nx-task-item>
          </div>
        `)}
      </div>
    `;
  }

  _renderTasksCollapsed(runningTask, current, total) {
    return html`
      <div class="plan-tasks plan-tasks-collapsed">
        <span class="plan-tasks-progress">${current}/${total}</span>
        <div class="plan-task-row">
          <nx-task-item
            truncate
            status=${TASK_STATUS.RUNNING}
            label=${runningTask.label ?? ''}
          ></nx-task-item>
        </div>
      </div>
    `;
  }

  render() {
    const plan = this.plan ?? {};
    const { title = '', description = '', tasks = [] } = plan;

    const running = this._findRunningTask(tasks);
    const isRunning = running !== null;
    const isAllDone = tasks.length > 0 && tasks.every((t) => t.status === TASK_STATUS.DONE);
    const isDone = !isRunning && isAllDone;
    let runBtnLabel = 'Run';
    if (isRunning) runBtnLabel = 'Running...';
    else if (isDone) runBtnLabel = 'Done';
    const runBtnClass = `plan-btn ${isRunning ? 'plan-btn-ghost' : 'plan-btn-primary'} plan-btn-run`;

    return html`
      <details class="plan-card" open>
        <summary class="plan-summary">
          <div class="plan-header">
            <span class="plan-type-label">
              <span class="plan-type-icon" aria-hidden="true"></span>
              Content Generation Plan
            </span>
            <div class="plan-header-actions">
              <button
                type="button"
                class=${runBtnClass}
                ?disabled=${isRunning || isDone}
                @click=${(e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isRunning && !isDone) this._dispatch(PLAN_RUN_EVENT);
  }}
              >${runBtnLabel}</button>
              ${icon('s2-icon-chevrondown-20-n', 'plan-chevron-icon')}
            </div>
          </div>

          <div class="plan-body">
            <h3 class="plan-title">${title}</h3>
            ${description ? html`<p class="plan-description">${description}</p>` : nothing}
          </div>

          ${isRunning
    ? this._renderTasksCollapsed(running.task, running.current, tasks.length)
    : nothing}
        </summary>

        ${this._renderTasksFull(tasks)}
      </details>
    `;
  }
}

customElements.define('nx-campaign-plan-card', NxCampaignPlanCard);

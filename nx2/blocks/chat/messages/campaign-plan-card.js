import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { TASK_STATUS } from './task-item.js';

const styles = await loadStyle(import.meta.url);

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
    _isExpanded: { state: true },
  };

  constructor() {
    super();
    this._isExpanded = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _dispatch(eventName) {
    this.dispatchEvent(new CustomEvent(eventName, {
      bubbles: true, composed: true, detail: { plan: this.plan },
    }));
  }

  _runningState(tasks) {
    const runningIdx = tasks.findIndex((t) => t.status === TASK_STATUS.RUNNING);
    return runningIdx >= 0 ? { task: tasks[runningIdx], current: runningIdx + 1 } : null;
  }

  _renderChevronIcon() {
    return html`
      <svg class="plan-chevron-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
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
      <div class="plan-tasks">
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

    const running = this._runningState(tasks);
    const isRunning = running !== null;
    const isAllDone = tasks.length > 0 && tasks.every((t) => t.status === TASK_STATUS.DONE);
    const isDone = !isRunning && isAllDone;
    let runBtnLabel = 'Run';
    if (isRunning) runBtnLabel = 'Running...';
    else if (isDone) runBtnLabel = 'Done';
    const runBtnClass = `plan-btn ${isRunning ? 'plan-btn-ghost' : 'plan-btn-primary'} plan-btn-run`;
    const chevronClass = `plan-icon-btn${this._isExpanded ? ' plan-icon-btn-expanded' : ''}`;
    const chevronLabel = this._isExpanded ? 'Collapse plan' : 'Expand plan';

    return html`
      <div class="plan-card">
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
              @click=${() => !isRunning && !isDone && this._dispatch('nx-plan-run')}
            >${runBtnLabel}</button>
            <button
              type="button"
              class=${chevronClass}
              aria-label=${chevronLabel}
              @click=${() => { this._isExpanded = !this._isExpanded; }}
            >${this._renderChevronIcon()}</button>
          </div>
        </div>

        <div class="plan-body">
          <h3 class="plan-title">${title}</h3>
          ${description ? html`<p class="plan-description">${description}</p>` : nothing}
        </div>

        ${!this._isExpanded && isRunning
          ? this._renderTasksCollapsed(running.task, running.current, tasks.length)
          : nothing}
        ${this._isExpanded ? this._renderTasksFull(tasks) : nothing}
      </div>
    `;
  }
}

customElements.define('nx-campaign-plan-card', NxCampaignPlanCard);

import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import './task-item.js';
import { TASK_STATUS } from './task-item.js';

const styles = await loadStyle(import.meta.url);

/**
 * <nx-campaign-plan-card> — Content Generation Plan card.
 *
 * Renders a structured plan with a task list and action buttons.
 * Switches to a collapsed "running" view when any task has status 'running'.
 *
 * Properties:
 *   plan {Object}
 *     title       {string}   Plan title
 *     description {string}   Short description / subtitle
 *     tasks       {Array<{ id, label, status }>}
 *
 * Events dispatched (bubbles + composed):
 *   nx-plan-run    — user clicked Run
 *   nx-plan-view   — user clicked View plan
 *   nx-plan-export — user clicked the download icon
 *   nx-plan-expand — user clicked the fullscreen icon
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
    this.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true, detail: { plan: this.plan } }));
  }

  _runningState(tasks) {
    const runningIdx = tasks.findIndex((t) => t.status === TASK_STATUS.RUNNING);
    return runningIdx >= 0 ? { task: tasks[runningIdx], current: runningIdx + 1 } : null;
  }

  _renderDownloadIcon() {
    return html`
      <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M10 13.5L6 9.5h2.5V4h3v5.5H14L10 13.5Z" fill="currentColor"/>
        <rect x="4" y="15" width="12" height="1.5" rx="0.75" fill="currentColor"/>
      </svg>`;
  }

  _renderExpandIcon() {
    return html`
      <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M3 3h5.5v1.5H4.5V8H3V3Zm8.5 0H17v5h-1.5V4.5H11.5V3ZM3 12h1.5v3.5H8V17H3v-5Zm12.5 3.5H12V17h5v-5h-1.5v3.5Z" fill="currentColor"/>
      </svg>`;
  }

  _renderTasksIdle(tasks) {
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

  _renderTasksRunning(runningTask, current, total) {
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

    return html`
      <div class="plan-card">
        <div class="plan-header">
          <div class="plan-header-meta">
            <span class="plan-type-label">
              <span class="plan-type-icon" aria-hidden="true"></span>
              Content Generation Plan
            </span>
            <h3 class="plan-title">${title}</h3>
            ${description ? html`<p class="plan-description">${description}</p>` : nothing}
          </div>
          <div class="plan-header-actions">
            <button
              type="button"
              class="plan-icon-btn"
              aria-label="Download plan"
              @click=${() => this._dispatch('nx-plan-export')}
            >${this._renderDownloadIcon()}</button>
            <button
              type="button"
              class="plan-icon-btn"
              aria-label="Expand plan"
              @click=${() => this._dispatch('nx-plan-expand')}
            >${this._renderExpandIcon()}</button>
          </div>
        </div>

        ${isRunning
          ? this._renderTasksRunning(running.task, running.current, tasks.length)
          : this._renderTasksIdle(tasks)}

        <div class="plan-footer">
          <button
            type="button"
            class="plan-btn plan-btn-ghost"
            @click=${() => this._dispatch('nx-plan-view')}
          >View plan</button>
          <button
            type="button"
            class="plan-btn ${isRunning ? 'plan-btn-ghost' : 'plan-btn-primary'}"
            ?disabled=${isRunning}
            @click=${() => !isRunning && this._dispatch('nx-plan-run')}
          >${isRunning ? 'Running...' : 'Run'}</button>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-campaign-plan-card', NxCampaignPlanCard);

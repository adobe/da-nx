import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import { loadIms } from '../../../../utils/ims.js';
import { archiveProject, copyProject } from './index.js';

import './pagination.js';
import './filter-bar.js';
import createProjectData from './project-data.js';

const style = await getStyle(import.meta.url);

const { nxBase: nx } = getConfig();

const ICONS = [
  `${nx}/public/icons/S2_Icon_Copy_20_N.svg`,
  `${nx}/public/icons/S2_Icon_ProjectAddInto_20_N.svg`,
];

const ITEMS_PER_PAGE = 25;
const DRAFT_STATUS_HTML = html`<p class="draft-project"><strong>Draft</strong></p>`;
const AUTO_CLEAR_MESSAGE_TIME = 6 * 1000;

const hasNotStartedYet = (status) => !status || status === 'not started';

const NO_RESULTS_MESSAGE = {
  message: 'No projects match the current filters.',
  help: 'Try adjusting your search criteria or clearing some filters.',
};

class NxLocDashboard extends LitElement {
  static properties = {
    view: { attribute: false },
    org: { attribute: false },
    site: { attribute: false },
    _error: { state: true },
    _showFrom: { state: true },
    _showTo: { state: true },
    _projectData: { state: true },
    _projectsToDisplay: { state: true },
    _currentPage: { state: true },
    _isLoading: { state: true },
    _message: { state: true },
  };

  async getCurrentUser() {
    if (!this._currentUser) {
      const ims = await loadIms();
      if (!ims) return;
      this._currentUser = ims.email;
    }
  }

  setErrorMessage(message) {
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }
    this._message = { text: message, type: 'error' };

    this._messageTimeout = setTimeout(() => {
      this._message = null;
      this._messageTimeout = null;
    }, AUTO_CLEAR_MESSAGE_TIME);
  }

  handleError({ criticalError, projectError }) {
    if (criticalError) {
      this._error = criticalError;
    } else {
      this.setErrorMessage(projectError);
    }
  }

  async updateProjectsToDisplay(signal) {
    try {
      // eslint-disable-next-line max-len
      this._projectsToDisplay = (await this._projectData?.getDetailsForProjects(this._showFrom, this._showTo, signal)) ?? [];
    } finally {
      this._isLoading = false;
    }
  }

  /**
   * Update the show range to display the first page
   */
  updateShowRangeToFirstPage() {
    this._currentPage = 0;
    this._showFrom = 0;
    this._showTo = Math.min(ITEMS_PER_PAGE, this._projectData?.getTotalCount() ?? 0);
  }

  /**
   * Update the show range while attempting to stay on the current page.
   * If the current page no longer exists, go to the last available page.
   */
  updateShowRangePreservingPage() {
    const totalProjects = this._projectData?.getTotalCount() ?? 0;
    const maxPage = Math.max(0, Math.ceil(totalProjects / ITEMS_PER_PAGE) - 1);

    if (this._currentPage > maxPage) {
      this._currentPage = maxPage;
    }

    this._showFrom = this._currentPage * ITEMS_PER_PAGE;
    this._showTo = Math.min((this._currentPage + 1) * ITEMS_PER_PAGE, totalProjects);
  }

  async initializeProjectsAndUser() {
    if (!this._projectData) {
      await this.getCurrentUser();
      this.abortCurrentAndGetNewController();
      this._projectData = await createProjectData({
        org: this.org,
        site: this.site,
        currentUser: this._currentUser,
        handleError: this.handleError.bind(this),
        initialSignal: this._dataAbortController.signal,
      });
    }
    await this.updateProjectsToDisplay();
  }

  abortCurrentAndGetNewController() {
    if (this._dataAbortController) {
      this._dataAbortController.abort();
    }
    this._dataAbortController = new AbortController();
  }

  connectedCallback() {
    super.connectedCallback();
    this._showFrom = 0;
    this._showTo = ITEMS_PER_PAGE;
    this._currentPage = 0;
    this._isLoading = true;
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    // not awaiting to not block UI
    this.ensureInitialized();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up message timeout
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }
  }

  async ensureInitialized() {
    if (!this._initPromise) {
      this._initPromise = this.initializeProjectsAndUser();
    }
    await this._initPromise;
  }

  async handleFilterChange(filters) {
    this.abortCurrentAndGetNewController();

    try {
      await this.ensureInitialized();
      this._isLoading = true;
      await this._projectData.applyFilters(filters, this._dataAbortController.signal);
      this.updateShowRangeToFirstPage();
      await this.updateProjectsToDisplay(this._dataAbortController.signal);
    } catch (error) {
      if (error.name === 'AbortError') return; // ignore
      this.setErrorMessage('Failed to apply filters. Please try again.');
      this._isLoading = false;
    }
  }

  handleAction({ detail }) {
    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  async handleCopy(project) {
    // Do not copy if user information is not there
    if (!this._currentUser) {
      this.setErrorMessage('No user information present. Logged out?');
      return;
    }

    this._isLoading = true;
    try {
      const { path, lastModified, newProject } = await copyProject(project, this._currentUser);
      await this._projectData?.addNewProject(path, { ...newProject, lastModified });

      // Reset to first page to show the new project (copies are added at the top)
      this.updateShowRangeToFirstPage();
      await this.updateProjectsToDisplay();
      this.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      this.setErrorMessage(`Failed to copy project: "${project.title}"`);
    } finally {
      this._isLoading = false;
    }
  }

  async handleArchive(project) {
    this._isLoading = true;
    try {
      const oldPath = project.path;
      const newPath = await archiveProject(project);

      // Refresh the project list to reflect the removal
      this._projectData?.archiveProject(oldPath, newPath);

      // Stay on current page if possible, otherwise go to last page
      this.updateShowRangePreservingPage();
      await this.updateProjectsToDisplay();
    } catch (e) {
      this.setErrorMessage(`Failed to archive project: "${project.title}"`);
    } finally {
      this._isLoading = false;
    }
  }

  async handlePagination({ detail }) {
    await this.ensureInitialized();
    this._currentPage = detail.page ?? 0;
    this._showFrom = detail.showFrom ?? 0;
    this._showTo = detail.showTo ?? ITEMS_PER_PAGE;
    this._isLoading = true;
    await this.updateProjectsToDisplay();
    this.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  get _project() {
    return {
      view: this.view,
      org: this.org,
      site: this.site,
    };
  }

  renderStatus(project) {
    const { translateStatus, rolloutStatus, langsTotal, localesTotal } = project;

    if (
      hasNotStartedYet(translateStatus)
      && hasNotStartedYet(rolloutStatus)
      && langsTotal === 0
      && localesTotal === 0
    ) {
      return DRAFT_STATUS_HTML;
    }

    return html`${translateStatus ? html`<p><strong>Translation</strong> ${translateStatus}</p>` : nothing}
                ${rolloutStatus ? html`<p><strong>Rollout</strong> ${rolloutStatus}</p>` : nothing}`;
  }

  renderArchiveButton(project) {
    if (project.isArchived) return nothing;
    return html`<button class="archive-btn" @click=${() => this.handleArchive(project)}>
      <svg class="icon">
        <use href="#S2_Icon_ProjectAddInto_20_N"/>
      </svg>
    </button>`;
  }

  renderProjectRow(project) {
    if (!project) return nothing;
    if (project.failedToLoad) {
      return html`<li>
        <div class="inner">
          <div class="project-title">
            <p>${project.failedToLoad}</p>
          </div>
        </div>
      </li>`;
    }
    return html`
      <li>
        <div class="inner">
          <div class="project-title">
            <p><a href="#/${project.view}${project.path.replace('.json', '')}">${project.title}</a></p>
            <p>${project.created.date} ${project.created.time}</p>
          </div>
          <div class="project-modified">
            <p>${project.modifiedBy}</p>
            <p>${project.modified?.date} ${project.modified?.time}</p>
          </div>
          <div class="project-total">
            <p><strong>Languages</strong><span>${project.langsTotal}</span></p>
            <p>${project.localesTotal ? html`<strong>Locales</strong><span>${project.localesTotal}</span>` : nothing}</p>
          </div>
          <div class="project-status">
            ${this.renderStatus(project)}
          </div>
          <div class="project-actions">
            <button class="copy-btn" @click=${() => this.handleCopy(project)}><svg class="icon"><use href="#S2_Icon_Copy_20_N"/></svg></button>
            ${this.renderArchiveButton(project)}
          </div>
        </div>
      </li>
    `;
  }

  renderProjects(projects) {
    return html`
      <div class="nx-loc-list-header">
        <p>Project</p>
        <p>Modified</p>
        <p class="project-total">Languages</p>
        <p>Status</p>
        <p>Actions</p>
      </div>
      <ul>
        ${projects.map((project) => this.renderProjectRow(project))}
      </ul>
      <nx-pagination .currentPage=${this._currentPage} .totalItems=${this._projectData?.getTotalCount()} .itemsPerPage=${ITEMS_PER_PAGE} @page-change=${this.handlePagination}></nx-pagination>
    `;
  }

  renderMessage({ status, message, help }) {
    return html`
      <div class="nx-loc-step loc-error-step">
        ${status ? html`<p class="loc-error-code">${status}</p>` : nothing}
        <p class="loc-error-message">${message}</p>
        ${help ? html`<p class="loc-error-help">${help}</p>` : nothing}
      </div>
    `;
  }

  render() {
    const showNoResults = this._projectData?.hasFiltersWithNoResults()
      && !this._error
      && !this._isLoading;

    return html`
      <nx-loc-actions
        .project=${this._project}
        .message=${this._message}
        @action=${this.handleAction}>
      </nx-loc-actions>
      <nx-filter-bar @filter-change=${(e) => this.handleFilterChange(e.detail)}></nx-filter-bar>
      ${this._isLoading ? html`
        <div class="loading-bar">
          <div class="loading-bar-inner"></div>
        </div>
      ` : nothing}
      ${this._error ? this.renderMessage(this._error) : nothing}
      ${showNoResults ? this.renderMessage(NO_RESULTS_MESSAGE) : nothing}
      ${this._projectsToDisplay?.length ? this.renderProjects(this._projectsToDisplay) : nothing}
    `;
  }
}

customElements.define('nx-loc-dashboard', NxLocDashboard);

import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';
import { daFetch } from '../../../utils/daFetch.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxLocDashboard extends LitElement {
  static properties = {
    _view: { attribute: false },
    _projects: { attribute: false },
    _currentPage: { attribute: false },
    _projectsPerPage: { attribute: false },
    _siteBase: { attribute: false },
    _filteredProjects: { attribute: false },
    _searchQuery: { attribute: false },
    _startDate: { attribute: false },
    _endDate: { attribute: false },
    _showFilterPopup: false,
    _translationFilters: [],
    _rolloutFilters: [],
    translationStatuses: ['Error', 'Completed', 'Created', 'In Progress'],
    rolloutStatuses: ['Error', 'Completed', 'Rollout Ready', 'In Progress'],
  };

  constructor() {
    super();
    this._projects = [];
    this._filteredProjects = [];
    this._searchQuery = '';
    this._startDate = null;
    this._endDate = null;
    this._currentPage = 1;
    this._projectsPerPage = 5; // Show 5 projects per page
    this._showFilterPopup = false;
    this._translationFilters = [];
    this._rolloutFilters = [];
    this.translationStatuses = ['Error', 'Completed', 'Created', 'In Progress'];
    this.rolloutStatuses = ['Error', 'Completed', 'Rollout Ready', 'In Progress'];
  }

  create() {
    this._view = 'create';
  }

  async connectedCallback() {
    await this.getProjects();
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    window.addEventListener('click', this.handleOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('click', this.handleOutsideClick);
  }

  // Toggle the filter popup
  toggleFilterPopup(event) {
    this._showFilterPopup = !this._showFilterPopup;

    if (this._showFilterPopup) {
      const buttonRect = event.target.getBoundingClientRect();
      this._popupPosition = {
        top: buttonRect.bottom + window.scrollY,
        left: buttonRect.left + window.scrollX,
      };
    }
  }

  // Handle clicks outside the popup
  handleOutsideClick = (event) => {
    if (
      this._showFilterPopup
            && !event.composedPath().some((el) => el.classList?.contains('filter-popup'))
            && !event.composedPath().some((el) => el.classList?.contains('filter-button'))
    ) {
      this._showFilterPopup = false;
    }
  };

  // Update translation filter selections
  updateTranslationFilter(event) {
    const { value } = event.target;
    if (event.target.checked) {
      this._translationFilters = [...this._translationFilters, value];
    } else {
      this._translationFilters = this._translationFilters.filter(
        (filter) => filter !== value,
      );
    }
  }

  // Update rollout filter selections
  updateRolloutFilter(event) {
    const { value } = event.target;
    if (event.target.checked) {
      this._rolloutFilters = [...this._rolloutFilters, value];
    } else {
      this._rolloutFilters = this._rolloutFilters.filter(
        (filter) => filter !== value,
      );
    }
  }

  // Apply filters
  applyFilters() {
    this.filterProjects();
    this._showFilterPopup = false; // Close popup
  }

  // Update start date
  updateStartDate(event) {
    this._startDate = new Date(event.target.value).toISOString();
    this.filterProjects();
  }

  // Update end date
  updateEndDate(event) {
    this._endDate = new Date(event.target.value).toISOString();
    this.filterProjects();
  }

  // Filter projects by title, date range, and statuses
  filterProjects() {
    const query = this._searchQuery.toLowerCase();
    const startDate = this._startDate ? new Date(this._startDate) : null;
    const endDate = this._endDate ? new Date(this._endDate) : null;

    this._filteredProjects = this._projects.filter((project) => {
      const matchesQuery = project.title.toLowerCase().includes(query);

      const projectDate = new Date(project.createdOn);
      const matchesDateRange = (!startDate || projectDate >= startDate)
                && (!endDate || projectDate <= endDate);

      const matchesTranslation = this._translationFilters.length === 0
                || this._translationFilters.includes(project.translationStatus);

      const matchesRollout = this._rolloutFilters.length === 0
                || this._rolloutFilters.includes(project.rolloutStatus);

      return matchesQuery && matchesDateRange && matchesTranslation && matchesRollout;
    });

    this._currentPage = 1; // Reset to the first page when filtering
  }

  // Update the search query
  updateSearchQuery(event) {
    this._searchQuery = event.target.value;
    this.filterProjects();
  }

  getProjectStatuses(langs) {
    if (!langs || !Array.isArray(langs) || langs.length === 0) {
      return { translationStatus: 'No Languages', rolloutStatus: 'No Languages' };
    }

    const translationStatuses = langs.map((lang) => lang.translation?.status?.toLowerCase());
    const rolloutStatuses = langs.map((lang) => lang.rollout?.status?.toLowerCase());

    // Derive translation status
    let translationStatus;
    if (translationStatuses.some((status) => status === 'error')) {
      translationStatus = 'Error';
    } else if (translationStatuses.every((status) => status === 'complete')) {
      translationStatus = 'Completed';
    } else if (translationStatuses.every((status) => status === 'created')) {
      translationStatus = 'Created';
    } else if (translationStatuses.some((status) => status === 'in-progress')) {
      translationStatus = 'In Progress';
    } else {
      translationStatus = 'Unknown';
    }

    // Derive rollout status
    let rolloutStatus;
    if (rolloutStatuses.some((status) => status === 'error')) {
      rolloutStatus = 'Error';
    } else if (rolloutStatuses.every((status) => status === 'complete')) {
      rolloutStatus = 'Completed';
    } else if (rolloutStatuses.some((status) => status === 'ready')) {
      rolloutStatus = 'Rollout Ready';
    } else if (rolloutStatuses.some((status) => status === 'in-progress')) {
      rolloutStatus = 'In Progress';
    } else {
      rolloutStatus = 'Unknown';
    }

    return { translationStatus, rolloutStatus };
  }

  formatTimestamp(timestamp) {
    const date = new Date(timestamp);

    // Format options
    const options = {
      month: 'short', // Short month name
      day: '2-digit', // Numeric day
      year: 'numeric', // Full year
      hour: 'numeric', // Hour
      minute: '2-digit', // Minute
      hour12: true, // Use 12-hour format
    };

    // Format using Intl.DateTimeFormat
    const formattedDate = new Intl.DateTimeFormat('en-US', options).format(date);
    return formattedDate.replace(',', ''); // Remove unnecessary comma
  }

  async getProjectDetails(path) {
    const resp = await daFetch(`https://admin.da.live/versionlist${path}`);
    const json = await resp.json();
    if (json.length === 0) return 'anonymous';
    const oldestVersion = json.pop();
    const createdBy = oldestVersion?.users[0]?.email?.split('@')[0];
    // const createdOn = new Date(oldestVersion?.timestamp);
    const createdOn = this.formatTimestamp(oldestVersion?.timestamp);
    return { createdBy, createdOn };
  }

  async getProjects() {
    const siteBase = window.location.hash.replace('#', '');
    this._siteBase = siteBase?.slice(1);
    const resp = await daFetch(`https://admin.da.live/list${siteBase}/.da/translation/projects/active`);
    if (!resp.ok) return;
    const projectList = await resp.json();
    this._projects = await Promise.all(projectList.map(async (project) => {
      const projResp = await daFetch(`https://admin.da.live/source${project.path}`);
      const projJson = await projResp.json();
      project.title = projJson.title;
      const { createdBy, createdOn } = await this.getProjectDetails(project.path);
      project.languages = projJson.langs?.map((lang) => lang.name).join(', ');
      const { translationStatus, rolloutStatus } = this.getProjectStatuses(projJson.langs);
      return {
        title: project.title || 'Untitled',
        path: project.path,
        createdBy: createdBy || 'anonymous',
        createdOn: createdOn || 'unknown',
        languages: (project.languages || 'unknown'),
        translationStatus: translationStatus || 'unknown',
        rolloutStatus: rolloutStatus || 'unknown',
      };
    }));
    this._filteredProjects = [...this._projects]; // Initialize filtered projects with all projects
  }

  getPaginatedProjects() {
    const start = (this._currentPage - 1) * this._projectsPerPage;
    const end = start + this._projectsPerPage;
    const paginatedProjects = this._filteredProjects.slice(start, end);

    // Calculate record range
    this._paginationRange = {
      start: start + 1,
      end: Math.min(end, this._filteredProjects.length),
      total: this._filteredProjects.length,
    };

    return paginatedProjects;
  }

  // Handle page navigation
  goToPage(page) {
    if (page >= 1 && page <= Math.ceil(this._projects.length / this._projectsPerPage)) {
      this._currentPage = page;
    }
  }

  navigateToProject(path) {
    const projectPath = `#${path?.replace('.json', '')}`;
    window.location.hash = projectPath; // Update the URL hash
  }

  renderPaginationControls() {
    const totalPages = Math.ceil(this._filteredProjects.length / this._projectsPerPage);

    return html`
            <div class="pagination">
                <div class="pagination-info">
                    Showing ${this._paginationRange.start}–${this._paginationRange.end} of ${this._paginationRange.total}
                </div>
                <div class="pagination-controls">
                    <button
                            class="pagination-btn"
                            ?disabled=${this._currentPage === 1}
                            @click=${() => this.goToPage(this._currentPage - 1)}
                    >
                        Previous
                    </button>
                    ${Array.from({ length: totalPages }, (_, index) => index + 1).map(
    (page) => html`
                                <button
                                        class="pagination-btn ${this._currentPage === page ? 'active' : ''}"
                                        @click=${() => this.goToPage(page)}
                                >
                                    ${page}
                                </button>
                            `,
  )}
                    <button
                            class="pagination-btn"
                            ?disabled=${this._currentPage === totalPages}
                            @click=${() => this.goToPage(this._currentPage + 1)}
                    >
                        Next
                    </button>
                </div>
            </div>
        `;
  }

  renderLanguages(languages) {
    const langArray = languages.split(', '); // Convert the comma-separated string to an array
    const visibleLanguages = langArray.slice(0, 2); // Show the first two languages
    const remainingLanguages = langArray.slice(2); // Remaining languages for the tooltip

    return html`
    ${visibleLanguages.join(', ')}${remainingLanguages.length > 0
  ? html`
          <span
            class="tooltip"
            title="${remainingLanguages.join(', ')}"
          >
            +${remainingLanguages.length}
          </span>
        `
  : ''}
  `;
  }

  render() {
    const paginatedProjects = this.getPaginatedProjects();
    return html`
            ${this._view !== 'create'
    ? html`
                        <h1>Dashboard</h1>
                        <div class="filter-bar">

                            <input
                                    type="text"
                                    class="search-input"
                                    placeholder="Search projects by title..."
                                    .value=${this._searchQuery}
                                    @input=${this.updateSearchQuery}
                            />
                            <button class="filter-button" @click=${this.toggleFilterPopup}>
                                Filter
                            </button>
                            ${this._showFilterPopup
    ? html`
                                        <div
                                                class="filter-popup"
                                                style="top: ${this._popupPosition.top}px; left: ${this._popupPosition.left}px"
                                        >
                                            <h3>Filter Options</h3>
                                            <div class="filter-section">
                                                <h4>Translation Status</h4>
                                                <div class="checkbox-grid">
                                                    ${this.translationStatuses.map(
    (status) => html`
                                                                <label>
                                                                    <input
                                                                            type="checkbox"
                                                                            .value=${status}
                                                                            @change=${this.updateTranslationFilter}
                                                                    />
                                                                    ${status}
                                                                </label>
                                                            `,
  )}
                                                </div>
                                            </div>
                                            <div class="filter-section">
                                                <h4>Rollout Status</h4>
                                                <div class="checkbox-grid">
                                                    ${this.rolloutStatuses.map(
    (status) => html`
                                                                <label>
                                                                    <input
                                                                            type="checkbox"
                                                                            .value=${status}
                                                                            @change=${this.updateRolloutFilter}
                                                                    />
                                                                    ${status}
                                                                </label>
                                                            `,
  )}
                                                </div>
                                            </div>
                                            <button class="apply-filter-button" @click=${this.applyFilters}>
                                                Apply
                                            </button>
                                        </div>
                                    `
    : ''}
                            <div class="date-range">
                                <input
                                        type="date"
                                        class="date-picker"
                                        @change=${this.updateStartDate}
                                />
                                <span>to</span>
                                <input
                                        type="date"
                                        class="date-picker"
                                        @change=${this.updateEndDate}
                                />
                            </div>
                        </div>
                        <button class="accent" @click=${this.create}>Create Project</button>
                        ${this._filteredProjects.length
    ? html`
                                    <div class="table">
                                        <div class="table-header">
                                            <div class="table-cell">Project Name</div>
                                            <div class="table-cell">Created By</div>
                                            <div class="table-cell">Created Date</div>
                                            <div class="table-cell">Languages</div>
                                            <div class="table-cell">Localization Status</div>
                                            <div class="table-cell">Rollout Status</div>
                                            <div class="table-cell">Actions</div>
                                        </div>
                                        <div class="table-body">
                                            ${paginatedProjects.map(
    (project) => html`
                                                        <div class="table-row">
                                                            <div class="table-cell">${project.title}</div>
                                                            <div class="table-cell">${project.createdBy}</div>
                                                            <div class="table-cell">${project.createdOn}</div>
                                                            <div class="table-cell">${this.renderLanguages(project.languages)}</div>
                                                            <div class="table-cell">${project.translationStatus}</div>
                                                            <div class="table-cell">${project.rolloutStatus}</div>
                                                            <div class="table-cell actions">
                                                                <button class="edit-button" @click=${() => this.navigateToProject(project.path)}>Edit</button>
                                                            </div>
                                                        </div>
                                                    `,
  )}
                                        </div>
                                    </div>
                                    ${this.renderPaginationControls()}
                                `
    : html`<p>No projects found.</p>`}
                    `
    : html`<nx-loc-setup></nx-loc-setup>`}
        `;
  }
}

customElements.define('nx-loc-dashboard', NxLocDashboard);

import { html, LitElement } from '../../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { loadIms } from '../../../../utils/ims.js';
import './pagination.js';
import './filter-bar.js';
import './project-table.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);
let imsDetails;
let loggedinUser;
const DA_ORIGIN = 'https://admin.da.live';

class NxLocDashboard extends LitElement {
  static properties = {
    _view: { attribute: false },
    _projects: { attribute: false },
    _currentPage: { attribute: false },
    _siteBase: { attribute: false },
    _filteredProjects: { attribute: false },
    _loading: { attribute: false },
  };

  constructor() {
    super();
    this._projects = [];
    this._filteredProjects = [];
    this._currentPage = 1;
    this._projectsPerPage = 50;
    this._loading = true;
  }

  create() {
    this._view = 'create';
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    await this.getProjects();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  // Apply filters
  applyFilters(filters) {
    const {
      searchQuery,
      startDate,
      endDate,
      selectedTranslationStatuses,
      selectedRolloutStatuses,
      viewAllProjects,
    } = filters;

    this._filteredProjects = this._projects.filter((project) => {
      // Match search query
      const matchesSearch = searchQuery
        ? project.title.toLowerCase().includes(searchQuery?.toLowerCase())
        : true;

      // Match date range
      const projectDate = new Date(project.createdOn);
      const matchesDate = (!startDate || projectDate >= new Date(startDate))
                && (!endDate || projectDate <= new Date(endDate));

      // Match translation statuses
      const matchesTranslationStatus = selectedTranslationStatuses?.length === 0
                || selectedTranslationStatuses?.includes(project.translationStatus);

      // Match rollout statuses
      const matchesRolloutStatus = selectedRolloutStatuses?.length === 0
                || selectedRolloutStatuses?.includes(project.rolloutStatus);

      // Match ownership statuses
      const matchesOwnership = viewAllProjects || project.createdBy === loggedinUser;

      // Combine all filters
      // eslint-disable-next-line max-len
      return matchesSearch && matchesDate && matchesTranslationStatus && matchesRolloutStatus && matchesOwnership;
    });

    // Reset to the first page after applying filters
    this._currentPage = 1;
  }

  /**
   * Get the project statuses
   * @param {Array} langs - The languages of the project
   * @returns {Object} The project statuses
   */
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
    } else if (translationStatuses.some((status) => status === 'created')) {
      translationStatus = 'Created';
    } else if (translationStatuses.some((status) => status === 'in-progress') || translationStatuses.some((status) => status === 'uploading')) {
      translationStatus = 'In Progress';
    } else if (translationStatuses.every((status) => status === 'not started')) {
      translationStatus = 'Not Started';
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

  /**
   * Format a timestamp
   * @param {string} timestamp - The timestamp to format
   * @returns {string} The formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (!timestamp) {
      return 'unknown';
    }

    // Convert timestamp from seconds to milliseconds if needed
    const timestampMs = timestamp.toString().length === 10 ? timestamp * 1000 : timestamp;
    const date = new Date(timestampMs);

    // Check if date is invalid
    if (Number.isNaN(date.getTime())) {
      return 'unknown';
    }

    const options = {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true, // Use 12-hour format
    };

    // Format using Intl.DateTimeFormat
    const formattedDate = new Intl.DateTimeFormat('en-US', options).format(date);
    return formattedDate.replace(',', '');
  }

  /**
   * Get the projects
   */
  async getProjects() {
    try {
      imsDetails = await loadIms();
      loggedinUser = imsDetails?.email;
      const siteBase = window.location.hash.replace('#', '');
      this._siteBase = siteBase?.slice(1);
      const resp = await daFetch(`${DA_ORIGIN}/list${siteBase}/.da/translation/projects/active`);
      if (!resp.ok) return;
      const projectList = await resp.json();
      this._projects = await Promise.all(projectList.map(async (project) => {
        const projResp = await daFetch(`${DA_ORIGIN}/source${project.path}`);
        const projJson = await projResp.json();
        project.title = projJson.title;
        const createdBy = projJson?.email;
        const createdOn = this.formatTimestamp(projJson?.timestamp);

        project.languages = projJson.langs?.map((lang) => lang.name).join(', ');
        console.log(projJson.langs);
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
      this._filteredProjects = [...this._projects];
      // Sort projects by createdOn timestamp from latest to oldest
      this._filteredProjects.sort((a, b) => {
        if (a.createdOn === 'unknown' && b.createdOn === 'unknown') return 0;
        if (a.createdOn === 'unknown') return 1;
        if (b.createdOn === 'unknown') return -1;
        const dateA = new Date(a.createdOn);
        const dateB = new Date(b.createdOn);
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      this._loading = false;
    }
  }

  handlePagination(e) {
    this._currentPage = e.detail.page;
  }

  /**
   * Get the paginated projects
   * @returns {Array} The paginated projects
   */
  getPaginatedProjects() {
    const start = (this._currentPage - 1) * this._projectsPerPage;
    const end = start + this._projectsPerPage;
    return this._filteredProjects.slice(start, end);
  }

  navigateToProject(path) {
    window.location.hash = `#${path?.replace('.json', '')}`; // Update the URL hash
  }

  renderSpinner() {
    return html`
      <div class="loading-spinner">
        <div class="spinner"></div>
      </div>`;
  }

  /**
   * Duplicate a project
   * @param {string} path - The path of the project to duplicate
   * @param {string} title - The title of the project
   */
  async duplicateProject(path, title) {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    let json = await resp.json();
    json.title = title;
    const time = Date.now();
    const newPath = path.replace(/[^/]+$/, `${time}.json`);
    json = this.resetProjectState(json);

    const body = new FormData();
    const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
    body.append('data', blob);
    const opts = { method: 'POST', body };
    const fetchPath = `${DA_ORIGIN}/source${newPath}`;
    const newResp = await daFetch(fetchPath, opts);
    const verPath = `${DA_ORIGIN}/versionsource${newPath}`;
    await daFetch(verPath, { method: 'POST' });
    await this.getProjects();
    if (!newResp.ok) {
      this._error = 'Something went wrong.';
    } else {
      const event = new CustomEvent('duplication-complete', {
        detail: { projectPath: newPath },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(event);
    }
  }

  /**
   * Reset the project state
   * @param {Object} json - The project data
   * @returns {Object} The reset project data
   */
  resetProjectState(json) {
    json.langs = json?.langs?.map((lang) => {
      lang.rollout = { status: 'not started' };
      lang.translation = { status: 'not started' };
      delete lang.rolloutDate;
      delete lang.rolloutTime;
      delete lang.rolledOut;
      delete lang.errors;
      return lang;
    });
    json.urls = json?.urls?.map((url) => {
      delete url?.srcPath;
      delete url?.synced;
      return url;
    });
    json.sourceLang = { ...json?.sourceLang, lastSync: undefined };
    delete json?.translateComplete;
    return json;
  }

  /**
   * Archive a project
   * @param {string} path - The path of the project to archive
   */
  async archiveProject(path) {
    const destinationPath = path.replace('/active/', '/archived/');
    const body = new FormData();
    body.append('destination', destinationPath);
    const moveSourcePath = `${DA_ORIGIN}/move${path}`;
    const response = await daFetch(moveSourcePath, { method: 'POST', body });

    if (response.ok) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = 'Project archived successfully';
      this.shadowRoot.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
          this.shadowRoot.removeChild(toast);
        }, 300);
      }, 3000);
    }

    await this.getProjects();
  }

  renderProjects() {
    const paginatedProjects = this.getPaginatedProjects();
    return html`
      <nx-projects-table
        .projects=${paginatedProjects}
        @navigate-to-project=${(e) => this.navigateToProject(e.detail.path)}
        @duplicate-project=${(e) => this.duplicateProject(e.detail.path, e.detail.title)}
        @archive-project=${(e) => this.archiveProject(e.detail.path)}
      ></nx-projects-table>
      <nx-pagination .currentPage=${this._currentPage} .totalItems=${this._filteredProjects.length} .itemsPerPage=${this._projectsPerPage} @page-change=${this.handlePagination}></nx-pagination>`;
  }

  getMainContent() {
    let content;
    if (this._loading) {
      content = this.renderSpinner();
    } else if (this._filteredProjects.length > 0) {
      content = this.renderProjects();
    } else {
      content = html`<p>No projects found.</p>`;
    }
    return content;
  }

  render() {
    return html`
      ${this._view !== 'create' ? html`
        <div class="dashboard-header">
          <h1>Dashboard</h1>
          <button class="accent" @click=${this.create}>Create Project</button>
        </div>
        <nx-filter-bar @filter-change=${(e) => this.applyFilters(e.detail)}></nx-filter-bar>
        ${this.getMainContent()}`
    : html`<nx-loc-setup></nx-loc-setup>`}`;
  }
}

customElements.define('nx-loc-dashboard', NxLocDashboard);

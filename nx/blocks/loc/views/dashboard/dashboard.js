import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { loadIms } from '../../../../utils/ims.js';
import { fetchProjectList, fetchPagedDetails } from './index.js';

import './pagination.js';
import './filter-bar.js';
import './project-table.js';

const style = await getStyle(import.meta.url);

const PAGE_COUNT = 50;

class NxLocDashboard extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    _activeProjects: { state: true },
    _filteredProjects: { state: true },

    // _view: { attribute: false },
    // _projects: { attribute: false },
    // _currentPage: { attribute: false },
    // _siteBase: { attribute: false },
    // _filteredProjects: { attribute: false },
    // _loading: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.getCurrentUser();
    this.getProjects();
  }

  async getCurrentUser() {
    const ims = await loadIms();
    if (!ims) return;
    this._currentUser = ims.email;
  }

  async getProjects() {
    const projectList = await fetchProjectList(this.org, this.site);
    this._activeProjects = await fetchPagedDetails(projectList, PAGE_COUNT);
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
      const matchesOwnership = viewAllProjects || project.createdBy === currentUser;

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

  renderProjects(type) {
    return html`
      <div class="nx-loc-list-header">
        <p>Project</p>
        <p>Created</p>
        <p>Languages</p>
        <p>Status</p>
        <p>Actions</p>
      </div>
      <ul>
        ${this[type].map((project) => html`
          <li>
            <div class="inner">
              <p>${project.title}</p>
              <div>
                <p>${project.createdBy}</p>
                <p>${project.created.date} ${project.created.time}</p>
              </div>
              <p>${project.langsTotal}</p>
              <p>Status</p>
              <p>Actions</p>
            </div>
          </li>
        `)}
      </ul>
    `;
  }

  render() {
    return html`
      <nx-filter-bar @filter-change=${(e) => this.applyFilters(e.detail)}></nx-filter-bar>
      ${this._activeProjects ? this.renderProjects('_activeProjects') : nothing}
    `;
  }
}

customElements.define('nx-loc-dashboard', NxLocDashboard);

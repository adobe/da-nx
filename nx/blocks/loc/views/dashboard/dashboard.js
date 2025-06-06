import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import { loadIms } from '../../../../utils/ims.js';
import { fetchProjectList, fetchPagedDetails, archiveProject, copyProject } from './index.js';

import './pagination.js';
import './filter-bar.js';
import './project-table.js';

const style = await getStyle(import.meta.url);

const { nxBase: nx } = getConfig();

const ICONS = [
  `${nx}/public/icons/S2_Icon_Copy_20_N.svg`,
  `${nx}/public/icons/S2_Icon_ProjectAddInto_20_N.svg`,
];

const PAGE_COUNT = 50;

class NxLocDashboard extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    _projectList: { state: true },
    _filteredProjects: { state: true },
    _hasAnyFilters: { state: true },
    _error: { state: true },
    _useArchivedList: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
    this.getCurrentUser();
    this.getProjects();
  }

  async getCurrentUser() {
    const ims = await loadIms();
    if (!ims) return;
    this._currentUser = ims.email;
  }

  async getProjects(type = 'active') {
    const { projects, message } = await fetchProjectList(this.org, this.site, type);
    if (message) {
      this._error = message;
      return;
    }
    this._projectList = await fetchPagedDetails(projects, PAGE_COUNT);
  }

  // Apply filters
  async applyFilters(filters) {
    const {
      searchQuery,
      startDate,
      endDate,
      selectedTranslationStatuses,
      selectedRolloutStatuses,
      viewAllProjects,
      showArchivedProjects,
    } = filters;

    this._hasAnyFilters = searchQuery?.length
      || startDate
      || endDate
      || selectedTranslationStatuses?.length
      || selectedRolloutStatuses?.length
      || !viewAllProjects
      || !showArchivedProjects;

    if (this._useArchivedList !== showArchivedProjects) {
      this._projectList = [];
      await this.getProjects(showArchivedProjects ? 'archive' : 'active');
      this._useArchivedList = showArchivedProjects;
    }

    this._filteredProjects = this._projectList.filter((project) => {
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
      const matchesOwnership = viewAllProjects || project.createdBy === this._currentUser;

      // Combine all filters
      return matchesSearch
        && matchesDate
        && matchesTranslationStatus
        && matchesRolloutStatus
        && matchesOwnership;
    });

    // Reset to the first page after applying filters
    this._currentPage = 1;
  }

  getCurrentList() {
    return this._hasAnyFilters ? this._filteredProjects : this._projectList;
  }

  handleAction({ detail }) {
    if (detail === 'prev') {
      const opts = { detail: { href: `/apps#/${this.org}/${this.site}` }, bubbles: true, composed: true };
      const event = new CustomEvent('prev', opts);
      this.dispatchEvent(event);
      return;
    }
    const opts = { detail: { hash: `#/basics/${this.org}/${this.site}` }, bubbles: true, composed: true };
    const event = new CustomEvent('next', opts);
    this.dispatchEvent(event);
  }

  async handleCopy(project) {
    const [newProject] = await copyProject(project, this._currentUser);
    this.getCurrentList().unshift(newProject);
    this.requestUpdate();
  }

  handleArchive(project, idx) {
    archiveProject(project);
    this.getCurrentList().splice(idx, 1);
    this.requestUpdate();
  }

  renderStatus(project) {
    const draft = () => html`<p class="draft-project"><strong>Draft</strong></p>`;

    const { translateStatus, rolloutStatus } = project;
    if (!translateStatus && !rolloutStatus) return draft();

    if (translateStatus === 'not started' && rolloutStatus === 'not started') return draft();

    return html`${project.translateStatus ? html`<p><strong>Translation</strong> ${project.translateStatus}</p>` : nothing}
                ${project.rolloutStatus ? html`<p><strong>Rollout</strong> ${project.rolloutStatus}</p>` : nothing}`;
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
        ${projects.map((project, idx) => html`
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
                ${this._useArchivedList ? nothing : html`<button class="archive-btn" @click=${() => this.handleArchive(project, idx)}><svg class="icon"><use href="#S2_Icon_ProjectAddInto_20_N"/></svg></button>`}
              </div>
            </div>
          </li>
        `)}
      </ul>
    `;
  }

  renderError() {
    return html`
      <div class="nx-loc-step loc-error-step">
        <p class="loc-error-code">${this._error.status}</p>
        <p class="loc-error-message">${this._error.message}</p>
        <p class="loc-error-help">${this._error.help}</p>
      </div>
    `;
  }

  render() {
    const projects = this.getCurrentList();

    return html`
      <nx-filter-bar @filter-change=${(e) => this.applyFilters(e.detail)}></nx-filter-bar>
      ${this._error ? this.renderError() : nothing}
      ${projects ? this.renderProjects(projects) : nothing}
    `;
  }
}

customElements.define('nx-loc-dashboard', NxLocDashboard);

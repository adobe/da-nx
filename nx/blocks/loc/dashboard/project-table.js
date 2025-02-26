import { html, LitElement } from '../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxProjectsTable extends LitElement {
  static properties = {
    projects: { type: Array },
    _duplicatingId: { state: true },
    _showModal: { state: true },
    _modalProject: { state: true },
    _duplicateName: { state: true },
    _createdProject: { state: true },
  };

  constructor() {
    super();
    this.projects = [];
    this._duplicatingId = null;
    this._showModal = false;
    this._modalProject = null;
    this._duplicateName = '';
    this._createdProject = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
    window.addEventListener('duplication-complete', this.handleDuplicationComplete.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('duplication-complete', this.handleDuplicationComplete.bind(this));
  }

  renderLanguages(languages) {
    const langArray = languages.split(', '); // Convert the comma-separated string to an array
    const visibleLanguages = langArray.slice(0, 2); // Show the first two languages
    const remainingLanguages = langArray.slice(2); // Remaining languages for the tooltip

    return html`${visibleLanguages.join(', ')}${remainingLanguages.length > 0
      ? html`<span class="tooltip" title="${remainingLanguages.join(', ')}">+${remainingLanguages.length}</span>`
      : ''}`;
  }

  openDuplicateModal(project) {
    this._modalProject = project;
    this._duplicateName = `${project.title}-copy`;
    this._showModal = true;
  }

  closeModal() {
    this._showModal = false;
    this._modalProject = null;
    this._duplicateName = '';
    this._createdProject = null;
  }

  handleDuplicationComplete(event) {
    if (event.detail.projectPath) {
      this._duplicatingId = null;
      this._createdProject = event.detail.projectPath;
      this.closeModal();
      this.requestUpdate();
    }
  }

  async handleDuplicate(e) {
    e.preventDefault();
    this._duplicatingId = this._modalProject.path;
    const event = new CustomEvent('duplicate-project', {
      detail: {
        path: this._modalProject.path,
        title: this._duplicateName,
      },
    });
    this.dispatchEvent(event);
  }

  navigateToProject(path) {
    const event = new CustomEvent('navigate-to-project', {
      detail: { path },
    });
    this.dispatchEvent(event);
  }

  renderModal() {
    if (!this._showModal) return '';
    return html`
      <div class="modal-overlay">
        <div class="modal">
          <button class="close-button" @click=${this.closeModal}>
            <img src="${nxBase}/img/icons/S2IconClose20N-icon.svg" width="20" height="20" />
          </button>
          <h2>Copying Project : ${this._modalProject.title}</h2>
          ${this._duplicatingId ? html`
            <div class="spinner"></div>
          ` : ''}
          <div>
            <label>
              New Project Name:
              <input
                type="text"
                .value=${this._duplicateName}
                @input=${(e) => { this._duplicateName = e.target.value; }}
                required
              >
            </label>
            <div class="modal-buttons">
              <button
                @click=${this.handleDuplicate}
                ?disabled=${this._duplicatingId}>
                ${this._duplicatingId ? 'Duplicating...' : 'Duplicate'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      ${this.renderModal()}
      <div class="table">
        <div class="table-header">
          <div class="table-cell">Project</div>
          <div class="table-cell">Created</div>
          <div class="table-cell">Languages</div>
          <div class="table-cell">Localization Status</div>
          <div class="table-cell">Rollout Status</div>
          <div class="table-cell">Actions</div>
        </div>
        ${this.projects.map((project) => html`
          <div class="table-row ${this._duplicatingId === project.path ? 'duplicating' : ''}"
            @click=${(e) => {
    if (!e.target.closest('button')) {
      this.navigateToProject(project.path);
    }
  }}
            style="cursor: pointer;">
            <div class="table-cell">${project.title}</div>
            <div class="table-cell">
              ${project.createdBy}<br>
              ${project.createdOn}
            </div>
            <div class="table-cell">${this.renderLanguages(project.languages)}</div>
            <div class="table-cell">${project.translationStatus}</div>
            <div class="table-cell">${project.rolloutStatus}</div>
            <div class="table-cell actions">
              <button
                class="edit-button"
                @click=${() => this.navigateToProject(project.path)}>
                <img src="${nxBase}/public/icons/Smock_Archive_18_N.svg" alt="Archive" />
              </button>
              <button
                class="duplicate-button"
                ?disabled=${this._duplicatingId === project.path}
                @click=${() => this.openDuplicateModal(project)}>
                ${this._duplicatingId === project.path
    ? html`<div class="spinner"></div>`
    : html`<img src="${nxBase}/public/icons/Smock_Duplicate_18_N.svg" alt="Duplicate" />`}
              </button>
            </div>
          </div>`)}
      </div>`;
  }
}

customElements.define('nx-projects-table', NxProjectsTable);

import { html, LitElement } from '../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxProjectsTable extends LitElement {
  static properties = { projects: { type: Array } };

  constructor() {
    super();
    this.projects = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  renderLanguages(languages) {
    const langArray = languages.split(', '); // Convert the comma-separated string to an array
    const visibleLanguages = langArray.slice(0, 2); // Show the first two languages
    const remainingLanguages = langArray.slice(2); // Remaining languages for the tooltip

    return html`${visibleLanguages.join(', ')}${remainingLanguages.length > 0
      ? html`<span class="tooltip" title="${remainingLanguages.join(', ')}">+${remainingLanguages.length}</span>`
      : ''}`;
  }

  render() {
    return html`
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
        ${this.projects.map(
    (project) => html`
            <div class="table-row">
              <div class="table-cell">${project.title}</div>
              <div class="table-cell">${project.createdBy}</div>
              <div class="table-cell">${project.createdOn}</div>
              <div class="table-cell">${this.renderLanguages(project.languages)}</div>
              <div class="table-cell">${project.translationStatus}</div>
              <div class="table-cell">${project.rolloutStatus}</div>
              <div class="table-cell actions">
                <button
                  class="edit-button"
                  @click=${() => { const event = new CustomEvent('navigate-to-project', { detail: { path: project.path } }); this.dispatchEvent(event); }}>
                  Edit
                </button>
              </div>
            </div>`,
  )}
      </div>`;
  }
}

customElements.define('nx-projects-table', NxProjectsTable);

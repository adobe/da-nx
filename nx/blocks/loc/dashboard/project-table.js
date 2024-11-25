import { LitElement, html } from '../../../deps/lit/lit-core.min.js';

class NxProjectsTable extends LitElement {
  static properties = { projects: { type: Array } };

  render() {
    return html`
            <div class="table">
                <!-- Table Header -->
                <div class="table-header">
                    <div class="table-cell">Project Name</div>
                    <div class="table-cell">Created By</div>
                    <div class="table-cell">Created Date</div>
                    <div class="table-cell">Languages</div>
                    <div class="table-cell">Localization Status</div>
                    <div class="table-cell">Rollout Status</div>
                    <div class="table-cell">Actions</div>
                </div>

                <!-- Table Rows -->
                ${this.projects.map(
    (project) => html`
                            <div class="table-row">
                                <div class="table-cell">${project.title}</div>
                                <div class="table-cell">${project.createdBy}</div>
                                <div class="table-cell">${project.createdOn}</div>
                                <div class="table-cell">${project.languages}</div>
                                <div class="table-cell">${project.translationStatus}</div>
                                <div class="table-cell">${project.rolloutStatus}</div>
                                <div class="table-cell">
                                    <button
                                            class="edit-button"
                                            @click=${() => this.navigateToProject(project.path)}
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>
                        `,
  )}
            </div>
        `;
  }

  navigateToProject(path) {
    const projectPath = `#${path.replace('.json', '')}`;
    window.location.hash = projectPath; // Navigate to the project
  }
}

customElements.define('nx-projects-table', NxProjectsTable);

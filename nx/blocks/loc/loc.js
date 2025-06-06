import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import { getPathDetails, fetchProject, saveProject } from './utils/utils.js';

import '../../public/sl/components.js';

import './views/header/header.js';
import './views/steps/steps.js';
import './views/actions/actions.js';
import './views/dashboard/dashboard.js';
import './views/basics/basics.js';
import './views/validate/validate.js';
import './views/options/options.js';
import './views/sync/sync.js';
import './views/translate/translate.js';
import './views/rollout/rollout.js';
import './views/complete/complete.js';
import './views/url-details/url-details.js';

const EL_NAME = 'nx-loc';

const { nxBase: nx } = getConfig();
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxLoc extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    view: { attribute: false },
    path: { attribute: false },
    _title: { state: true },
    _options: { state: true },
    _langs: { state: true },
    _urls: { state: true },
    _error: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
  }

  update(props) {
    // Only get the project when the path changes
    if (props.has('path') && this.path) this.loadProject();

    // Reset the current project when the view is dashboard
    if (props.has('view') && this.view === 'dashboard') {
      this.setProject({});
    }
    super.update();
  }

  setProject(project) {
    console.log(project);
    this._title = project.title;
    this._options = project.options;
    this._langs = project.langs;
    this._urls = project.urls;
  }

  async loadProject() {
    const href = `/${this.org}/${this.site}${this.path}`;

    const { error, project } = await fetchProject(href);

    if (error) {
      this._error = error;
      return;
    }

    this.setProject(project);
  }

  async saveProject(view, data) {
    this._message = { text: 'Saving...' };

    const { error, project } = await saveProject(this.path, { ...data, view });
    if (error) {
      this._error = error;
      return null;
    }
    this.setProject(project);

    this._message = undefined;

    return project;
  }

  async handleAction({ detail }) {
    const { href, view, save } = detail;

    const { message, data } = await this.stepData;
    if (message) {
      this._message = message;
      return;
    }

    const { path } = save ? await this.saveProject(view, data) : this;

    if (href) {
      window.location.href = href;
      return;
    }

    const base = `/${view}/${this.org}/${this.site}`;
    window.location.hash = view === 'dashboard' || !path ? base : `${base}${path}`;
  }

  get project() {
    return {
      org: this.org,
      site: this.site,
      title: this._title,
      options: this._options,
      langs: this._langs,
      urls: this._urls,
    };
  }

  get stepData() {
    return this.shadowRoot.querySelector('.nx-loc-step').getData();
  }

  renderView() {
    if (this.view === 'dashboard') {
      return html`
        <nx-loc-dashboard
          class="nx-loc-step"
          .org=${this.org}
          .site=${this.site}
          @message=${this.handleMessage}>
        </nx-loc-dashboard>`;
    }

    if (this.view === 'basics') {
      return html`
        <nx-loc-basics
          class="nx-loc-step"
          .org=${this.org}
          .site=${this.site}
          .title=${this._title}
          .urls=${this._urls}
          @message=${this.handleMessage}>
        </nx-loc-basics>`;
    }

    if (this.view === 'validate') {
      return html`
        <nx-loc-validate
          class="nx-loc-step"
          .org=${this.org}
          .site=${this.site}
          .urls=${this._urls}
          @message=${this.handleMessage}>
        </nx-loc-validate>`;
    }

    if (this.view === 'options') {
      return html`
        <nx-loc-options
          class="nx-loc-step"
          .org=${this.org}
          .site=${this.site}
          .urls=${this._urls}
          @message=${this.handleMessage}>
        </nx-loc-options>
      `;
    }

    if (this.view === 'sync' && this._urls) {
      return html`
        <nx-loc-sync
          .org=${this.org}
          .site=${this.site}
          .path=${this.path}
          .title=${this._title}
          .options=${this._options}
          .langs=${this._langs}
          .urls=${this._urls}
          @message=${this.handleMessage}>
        </nx-loc-sync>
      `;
    }

    if (this.view === 'translate' && this._urls) {
      return html`
        <nx-loc-translate
          .org=${this.org}
          .site=${this.site}
          .path=${this.path}
          .title=${this._title}
          .options=${this._options}
          .langs=${this._langs}
          .urls=${this._urls}
          @message=${this.handleMessage}>
        </nx-loc-translate>
      `;
    }

    if (this.view === 'rollout' && this._urls) {
      return html`
        <nx-loc-rollout
          .org=${this.org}
          .site=${this.site}
          .path=${this.path}
          .title=${this._title}
          .options=${this._options}
          .langs=${this._langs}
          .urls=${this._urls}
          @message=${this.handleMessage}>
        </nx-loc-rollout>
      `;
    }

    if (this.view === 'complete') {
      return html`
        <nx-loc-complete
          .org=${this.org}
          .site=${this.site}
          .path=${this.path}
          @message=${this.handleMessage}>
        </nx-loc-complete>
      `;
    }
    return nothing;
  }

  renderSteps() {
    return html`
      <nx-loc-steps
        .view=${this.view}
        .org=${this.org}
        .site=${this.site}
        .options=${this._options}
        .langs=${this._langs}
        .urls=${this._urls}>
      </nx-loc-steps>
    `;
  }

  renderActions() {
    return html`
      <nx-loc-actions
        .view=${this.view}
        .project=${this.project}
        .message=${this._message}
        @action=${this.handleAction}>
      </nx-loc-actions>
    `;
  }

  renderError() {
    return html`
      <nx-loc-header title="Error"></nx-loc-header>
      <div class="nx-loc-step-wrapper loc-error-step">
        <p class="loc-error-code">${this._error.status}</p>
        <p class="loc-error-message">${this._error.message}</p>
        <p class="loc-error-help">${this._error.help}</p>
      </div>
    `;
  }

  render() {
    if (this._error) return this.renderError();

    return html`
      <nx-loc-header
        view=${this.view}
        title=${this._title}>
      </nx-loc-header>
      ${this.renderSteps()}
      ${this.renderActions()}
      <div class="nx-loc-step-wrapper">
        ${this.renderView()}
      </div>
    `;
  }
}

customElements.define('nx-loc', NxLoc);

function setup(el) {
  let cmp = el.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }
  const details = getPathDetails();
  cmp.view = details.view;
  cmp.org = details.org;
  cmp.site = details.site;
  cmp.path = details.path;
}

/**
 * Handles services that do not persist
 * hash-based callback URLs.
 */
function handleHashCallback() {
  const currentProject = localStorage.getItem('currentProject');
  if (currentProject) {
    localStorage.setItem('prevHash', window.location.hash);
    localStorage.removeItem('currentProject');
    window.location.hash = currentProject;
  }
}

export default function init(el) {
  el.innerHTML = '';
  handleHashCallback();
  setup(el);
  window.addEventListener('hashchange', () => { setup(el); });
}

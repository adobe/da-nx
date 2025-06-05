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
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
  }

  update(props) {
    // Only get the project when the path changes
    if (props.has('path') && this.path) this.getProject();
    super.update();
  }

  setProject(project) {
    this._title = project.title;
    this._options = project.options;
    this._langs = project.langs;
    this._urls = project.urls;
  }

  async getProject() {
    const href = `/${this.org}/${this.site}${this.path}`;

    const project = await fetchProject(href);
    if (project.error) {
      this._error = project.error;
      return;
    }

    this.setProject(project);
  }

  async handleNext(e) {
    const { detail } = e;
    if (!detail) return;

    // Dashboard will set a hash to bypass saving an empty project
    if (detail.hash) {
      window.location.hash = detail.hash;
      return;
    }

    const { error, hash, project } = await saveProject(this.path, detail);
    if (error) return;

    // Set everything before we swap views
    // This prevents a new view from getting
    // old project info.
    this.setProject(project);
    window.location.hash = hash;
  }

  handlePrev(prevView) {
    if (prevView === 'apps') {
      window.location.href = `/apps#/${this.org}/${this.site}`;
      return;
    }

    const stripped = window.location.hash.replace('#', '');
    const hash = stripped.replace(this.view, prevView);
    window.location.hash = hash;
  }

  renderView() {
    if (this.view === 'dashboard') {
      return html`
        <nx-loc-dashboard
          .org=${this.org}
          .site=${this.site}
          @prev=${() => this.handlePrev('apps')}
          @next=${this.handleNext}>
        </nx-loc-dashboard>`;
    }

    if (this.view === 'basics') {
      return html`
        <nx-loc-basics
          .org=${this.org}
          .site=${this.site}
          .title=${this._title}
          .urls=${this._urls}
          @prev=${() => this.handlePrev('dashboard')}
          @next=${this.handleNext}>
        </nx-loc-basics>`;
    }

    if (this.view === 'validate') {
      return html`
        <nx-loc-validate
          .org=${this.org}
          .site=${this.site}
          .urls=${this._urls}
          @prev=${() => this.handlePrev('basics')}
          @next=${this.handleNext}>
        </nx-loc-validate>`;
    }

    if (this.view === 'options') {
      return html`
        <nx-loc-options
          .org=${this.org}
          .site=${this.site}
          .urls=${this._urls}
          @prev=${() => this.handlePrev('validate')}
          @next=${this.handleNext}>
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
          @prev=${() => this.handlePrev('dashboard')}
          @next=${this.handleNext}>
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
          @prev=${() => this.handlePrev('sync')}
          @next=${this.handleNext}>
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
          @prev=${() => this.handlePrev('translate')}
          @next=${this.handleNext}>
        </nx-loc-rollout>
      `;
    }

    if (this.view === 'complete') {
      return html`
        <nx-loc-complete
          .org=${this.org}
          .site=${this.site}
          .path=${this.path}
          @prev=${() => this.handlePrev('dashboard')}
          @next=${this.handleNext}>
        </nx-loc-complete>
      `;
    }
    return nothing;
  }

  renderError() {
    return html`
      <nx-loc-header
        title="Error"></nx-loc-header>
      <div class="nx-loc-step loc-error-step">
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
        title=${this._title}></nx-loc-header>
      <nx-loc-steps
        .view=${this.view}
        .org=${this.org}
        .site=${this.site}
        .options=${this._options}
        .langs=${this._langs}
        .urls=${this._urls}>
      </nx-loc-steps>
      <div class="nx-loc-step">
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

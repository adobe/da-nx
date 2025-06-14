import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import { getHashDetails, loadProject, updateProject } from './utils/utils.js';

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
    view: { attribute: false },
    org: { attribute: false },
    site: { attribute: false },
    path: { attribute: false },
    _project: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
  }

  update(props) {
    if (props.has('path')) this._project = undefined;
    if (props.has('view')) this.getProject();
    super.update();
  }

  async getProject() {
    // If there's no path, create a synthetic project
    if (!this.path) {
      this._project = {
        view: this.view,
        org: this.org,
        site: this.site,
      };
      return;
    }

    const path = `/${this.org}/${this.site}${this.path}`;

    const { message, project } = await loadProject({ path });
    if (message) this._message = message;

    // The hash-based view should override the project view
    if (project) this._project = { ...project, view: this.view };
  }

  async handleSave({ detail }) {
    // Combine the cached project with the new data
    const updates = { ...this._project, ...detail.data };

    this._message = { text: 'Saving...' };

    const { message, hash, project } = await updateProject({ path: this.path, updates });

    // Set a message even if its undefined
    this._message = message;

    // Cache new project details
    if (project) this._project = project;

    // Set the new hash if it's defined
    if (hash) window.location.hash = hash;
  }

  async handleAction({ detail }) {
    const { href, hash, data } = detail;

    if (href) window.location.href = href;

    if (hash) window.location.hash = hash;

    if (data) await this.handleSave({ detail });
  }

  renderView() {
    if (this.view === 'dashboard') {
      return html`<nx-loc-dashboard .view=${this.view} .org=${this.org} .site=${this.site} @action=${this.handleAction}></nx-loc-dashboard>`;
    }

    if (this.view === 'basics') {
      return html`<nx-loc-basics .project=${this._project} .message=${this._message} @action=${this.handleAction}></nx-loc-basics>`;
    }

    if (this.view === 'validate') {
      return html`<nx-loc-validate .project=${this._project} .message=${this._message} @action=${this.handleAction}></nx-loc-validate>`;
    }

    if (this.view === 'options') {
      return html`<nx-loc-options .project=${this._project} .message=${this._message} @action=${this.handleAction}></nx-loc-options>`;
    }

    if (this.view === 'sync') {
      return html`<nx-loc-sync .project=${this._project} .message=${this._message} @action=${this.handleAction}></nx-loc-sync>`;
    }

    if (this.view === 'translate') {
      return html`<nx-loc-translate .project=${this._project} .message=${this._message} @action=${this.handleAction}></nx-loc-translate>`;
    }

    if (this.view === 'rollout') {
      return html`<nx-loc-rollout .project=${this._project} .message=${this._message} @action=${this.handleAction}></nx-loc-rollout>`;
    }

    if (this.view === 'complete') {
      return html`<nx-loc-complete .project=${this._project}></nx-loc-complete>`;
    }

    return nothing;
  }

  renderSteps() {
    if (this.view === 'dashboard' || this.view === 'complete') return nothing;
    return html`<nx-loc-steps .project=${this._project} @action=${this.handleAction}></nx-loc-steps>`;
  }

  render() {
    if (!this._project) return nothing;

    return html`
      <nx-loc-header .view=${this.view} .title=${this._project?.title}></nx-loc-header>
      ${this._project ? html`${this.renderSteps()}<div class="nx-loc-step">${this.renderView()}</div>` : nothing}
    `;
  }
}

customElements.define('nx-loc', NxLoc);

function setup(el) {
  const { hash, view, org, site, path } = getHashDetails(window.location.hash);
  if (hash) {
    window.location.hash = hash;
    return;
  }

  let cmp = el.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }
  cmp.view = view;
  cmp.org = org;
  cmp.site = site;
  cmp.path = path;
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

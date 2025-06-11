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
    if (props.has('path')) this.getProject();
    super.update();
  }

  async getProject() {
    // If there's no path, clear any cached project
    if (!this.path) {
      this._project = undefined;
      this._message = undefined;
      return;
    }

    const path = `/${this.org}/${this.site}/${this.path}`;

    const { message, project } = await loadProject({ path });
    if (message) this._message = message;
    if (project) this._project = project;
  }

  async handleSave({ detail }) {
    // Combine the cached project with the new data
    const updates = { ...this._project, ...detail.data };

    this._message = { text: 'Saving...' };
    const { message, hash, project } = await updateProject({ path: this.path, updates });

    // Always set a message even if it's undefined
    this._message = message;

    // Cache new project details
    if (project) this._project = project;

    // Set the new hash if it's defined
    if (hash) window.location.hash = hash;
  }

  async handleAction({ detail }) {
    const { href, hash, message } = detail;

    if (href) {
      window.location.href = href;
      return;
    }

    if (hash) {
      window.location.hash = hash;
      return;
    }

    if (message) {
      this._message = detail.message;
      // Don't continue if there's an error
      if (detail.message.type === 'error') return;
    }

    // Save any updates
    await this.handleSave({ detail });
  }

  handleMessage({ detail }) {
    this._message = detail.message;
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
          .project=${this._project}
          @message=${this.handleMessage}>
        </nx-loc-basics>`;
    }

    if (this.view === 'validate') {
      return html`
        <nx-loc-validate
          class="nx-loc-step"
          .org=${this.org}
          .site=${this.site}
          .project=${this._project}
          @message=${this.handleMessage}>
        </nx-loc-validate>`;
    }

    if (this.view === 'options') {
      return html`
        <nx-loc-options
          class="nx-loc-step"
          .org=${this.org}
          .site=${this.site}
          .project=${this._project}
          @message=${this.handleMessage}>
        </nx-loc-options>
      `;
    }

    if (this.view === 'sync' && this._urls) {
      return html`
        <nx-loc-sync
          class="nx-loc-step"
          .org=${this.org}
          .site=${this.site}
          .project=${this._project}
          @message=${this.handleMessage}>
        </nx-loc-sync>
      `;
    }

    if (this.view === 'translate' && this._urls) {
      return html`
        <nx-loc-translate
          class="nx-loc-step"
          .org=${this.org}
          .site=${this.site}
          .project=${this._project}
          @message=${this.handleMessage}>
        </nx-loc-translate>
      `;
    }

    if (this.view === 'rollout' && this._urls) {
      return html`
        <nx-loc-rollout
          class="nx-loc-step"
          .org=${this.org}
          .site=${this.site}
          .project=${this._project}
          @message=${this.handleMessage}>
        </nx-loc-rollout>
      `;
    }

    if (this.view === 'complete') {
      return html`
        <nx-loc-complete
          class="nx-loc-step"
          .org=${this.org}
          .site=${this.site}
          .project=${this._project}>
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
        .project=${this._project}
        .message=${this._message}
        @action=${this.handleAction}>
      </nx-loc-steps>
    `;
  }

  render() {
    return html`
      <nx-loc-header view=${this.view} title=${this._title}></nx-loc-header>
      ${this.renderSteps()}
      ${this.renderView()}
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
  const { hash, view, org, site, path } = getHashDetails(window.location.hash);
  if (hash) {
    window.location.hash = hash;
    return;
  }
  cmp.view = view;
  cmp.org = org;
  cmp.site = site;
  // Only set the path if it's a project
  if (path) cmp.path = path;
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

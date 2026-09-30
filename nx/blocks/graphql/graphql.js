import { html, LitElement, nothing } from 'da-lit';
import { hashChange, loadStyle } from '../../../nx2/utils/utils.js';
import { loadSite } from './utils/store.js';
import { buildHash, isSameRoute, toRoute } from './utils/route.js';
import { messageStyle, renderMessage } from './shared/message/message.js';

import '../../../nx2/public/sl/components.js';
import './nx-gql-header/nx-gql-header.js';

const EL_NAME = 'nx-graphql';

const [buttonStyle, style] = await Promise.all([
  loadStyle(new URL('../../../nx2/styles/buttons.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

const setHash = ({ route, replace }) => {
  const url = new URL(location.href);
  url.hash = buildHash(route);
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
};

const pageFor = (route) => (route.endpoint ? 'nx-gql-endpoint' : 'nx-gql-endpoints');

const loadPage = (route) => {
  const page = pageFor(route);
  return import(`./${page}/${page}.js`);
};

const isSameSite = (a, b) => a?.org === b?.org && a?.site === b?.site;

// Routes the hash to a page and loads the site the pages share.
class Graphql extends LitElement {
  static properties = {
    _route: { state: true },
    _site: { state: true },
    _isNew: { state: true },
    _changingSite: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttonStyle, messageStyle, style];
    const unsubscribeHash = hashChange.subscribe((details) => {
      const route = toRoute(details);
      if (route?.site && location.hash !== buildHash(route)) setHash({ route, replace: true });
      this.openRoute(route);
    });
    const onBeforeUnload = (event) => { if (this.page?.dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    this._teardown = () => {
      unsubscribeHash();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._teardown?.();
  }

  get page() {
    return this.shadowRoot.querySelector('nx-gql-endpoint');
  }

  async openRoute(route, { isNew, confirmed } = {}) {
    const current = this._route;
    if (isSameRoute({ route, other: current })) {
      this._isNew = isNew;
      return;
    }
    if (!confirmed && this.page?.dirty) {
      setHash({ route: current, replace: true });
      if (!await this.page.confirmLeave() || this._route !== current) return;
      setHash({ route });
    }
    this._route = route;
    this._isNew = isNew;
    if (!isSameSite(route, current) || this._site?.error) this._site = undefined;
    if (!route?.site) {
      this.handleChangeSite();
      return;
    }
    await Promise.all([this._site ? undefined : this.loadSite(route), loadPage(route)]);
  }

  async loadSite(route) {
    const loaded = await loadSite(route);
    if (this._route !== route) return;
    this._site = { ...loaded, org: route.org, site: route.site };
  }

  handleRouteChange({ detail }) {
    const { route, isNew, replace } = detail;
    setHash({ route, replace });
    this.openRoute(route, { isNew, confirmed: true });
  }

  async handleChangeSite() {
    await import('./shared/site-picker/site-picker.js');
    this._changingSite = true;
  }

  handleEndpointsChange({ detail }) {
    this._site = { ...this._site, endpoints: detail.endpoints };
  }

  handleSiteChange({ detail }) {
    this._changingSite = undefined;
    location.hash = buildHash(detail);
  }

  renderNoSite() {
    return renderMessage({
      heading: 'No site selected',
      text: 'Choose an organization and site to manage its GraphQL endpoints.',
      action: 'Choose a site',
      onAction: () => this.handleChangeSite(),
    });
  }

  renderSiteMissing() {
    const { org, site } = this._route;
    return renderMessage({
      heading: 'Site not found',
      text: html`No site was found at <strong>${org}/${site}</strong>. Verify the organization
        and site names, or request access from your administrator.`,
      action: 'Change site',
      onAction: () => this.handleChangeSite(),
      role: 'alert',
    });
  }

  renderSiteError() {
    const { org, site } = this._route;
    return renderMessage({
      heading: 'The site could not be loaded',
      text: html`<strong>${org}/${site}</strong> could not be loaded. Check your connection and
        access, then try again.`,
      action: 'Try again',
      onAction: () => {
        this._site = undefined;
        this.loadSite(this._route);
      },
      role: 'alert',
    });
  }

  renderPage() {
    const { endpoint } = this._route;
    if (endpoint) {
      return html`
        <nx-gql-endpoint .site=${this._site} name=${endpoint}
          ?isNew=${!!this._isNew}
          @route-change=${this.handleRouteChange}
          @endpoints-change=${this.handleEndpointsChange}
        @change-site=${this.handleChangeSite}></nx-gql-endpoint>`;
    }
    return html`
      <nx-gql-endpoints .site=${this._site}
        @route-change=${this.handleRouteChange}
        @endpoints-change=${this.handleEndpointsChange}
        @change-site=${this.handleChangeSite}></nx-gql-endpoints>`;
  }

  renderMain() {
    const { org, site } = this._route ?? {};
    const header = html`
      <nx-gql-header org=${org ?? nothing} site=${site ?? nothing}
        @change-site=${this.handleChangeSite}></nx-gql-header>`;
    if (!site) return html`${header}${this.renderNoSite()}`;
    if (!this._site) {
      return html`${header}
        <div class="loading" role="status">
          <span class="nx-loading-spinner" aria-hidden="true"></span>Loading endpoints…
        </div>`;
    }
    if (this._site.error) return html`${header}${this.renderSiteError()}`;
    if (!this._site.found) return html`${header}${this.renderSiteMissing()}`;
    return this.renderPage();
  }

  renderSitePicker() {
    const { org, site } = this._route ?? {};
    return html`
      <nx-site-picker .org=${org} .site=${site}
        @site-change=${this.handleSiteChange}
        @site-cancel=${() => { this._changingSite = undefined; }}></nx-site-picker>`;
  }

  render() {
    return html`
      ${this.renderMain()}
      ${this._changingSite ? this.renderSitePicker() : nothing}`;
  }
}

customElements.define(EL_NAME, Graphql);

export default function init(el) {
  el.replaceChildren(document.createElement(EL_NAME));
}

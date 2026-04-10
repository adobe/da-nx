import { loadArea, getMetadata, getConfig } from '../../scripts/nexter.js';
import loadStyle from '../../utils/styles.js';
import getSvg, { link2svg } from '../../utils/svg.js';
import { loadIms } from '../../utils/ims.js';

function brandGovernanceHref(experienceOrgSlug) {
  return `https://experience.adobe.com/#/@${experienceOrgSlug}/experiencemanager/governance-context`;
}

const FRESCOPA_SHOWCASE_HASH_PREFIX = '/aem-showcase/frescopa-da';
const FRESCOPA_BRAND_GOVERNANCE_HREF = 'https://experience.adobe.com/#/@aemshowcase/experiencemanager/governance-context/brands/frescopa';

function isFrescopaShowcaseHashContext() {
  const { hash } = window.location;
  if (!hash.startsWith('#/')) return false;
  return hash.slice(1).startsWith(FRESCOPA_SHOWCASE_HASH_PREFIX);
}

/**
 * Same org as profile `getOrg` (first `getOrgs()` entry). Experience URL slug is
 * `orgRef.ident@orgRef.authSrc` (IMS organizations payload).
 */
async function resolveImsOrgExperienceSlug() {
  try {
    const details = await loadIms(false);
    if (details.anonymous || typeof details.getOrgs !== 'function') return null;
    const orgs = await details.getOrgs();
    if (!orgs || typeof orgs !== 'object') return null;
    const [orgName] = Object.keys(orgs);
    if (!orgName) return null;
    const org = orgs[orgName];
    const ident = org?.orgRef?.ident;
    const authSrc = org?.orgRef?.authSrc ?? org?.orgRef?.authSource;
    if (!ident || !authSrc) return null;
    return `${ident}@${authSrc}`;
  } catch {
    return null;
  }
}

async function resolveBrandGovernanceHref() {
  if (isFrescopaShowcaseHashContext()) return FRESCOPA_BRAND_GOVERNANCE_HREF;
  const experienceOrgSlug = await resolveImsOrgExperienceSlug();
  if (!experienceOrgSlug) return null;
  return brandGovernanceHref(experienceOrgSlug);
}

const HASH_AWARE = ['Home', 'Apps'];
const NEW_UI_PREFIX = '/app/hannessolo/exp-workspace';
const NEW_UI_FRAGMENT_PATH = 'https://main--exp-workspace--hannessolo.aem.live/fragments/sidenav';

function getDefaultPath() {
  const { nxBase } = getConfig();
  return `${nxBase}/fragments/nx-sidenav`;
}

class SideNav extends HTMLElement {
  constructor() {
    super().attachShadow({ mode: 'open' });
    this.path = getMetadata('sidenav-source') || getDefaultPath();
    this._onHashChange = () => {
      const list = this.nav?.querySelector('ul');
      if (list) this.syncBrandGovernanceLink(list);
    };
  }

  async connectedCallback() {
    const style = await loadStyle(import.meta.url, this.shadowRoot);
    this.shadowRoot.adoptedStyleSheets = [style];
    this.nav = await this.fetchNav();
    this.render();
    window.addEventListener('hashchange', this._onHashChange);
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this._onHashChange);
  }

  async decorateIcons(area) {
    const links = [...area.querySelectorAll('a')];
    const svgs = links.map(async (link) => link2svg(link, this.shadowRoot));
    await Promise.all(svgs);
  }

  async syncBrandGovernanceLink(list) {
    if (!list) return;
    const governanceHref = await resolveBrandGovernanceHref();
    const existingLi = list.querySelector('li[data-nx-brand-governance]');

    if (!governanceHref) {
      existingLi?.remove();
      return;
    }

    if (existingLi) {
      const a = existingLi.querySelector('a');
      if (a) a.href = governanceHref;
      return;
    }

    const iconHref = new URL('../../img/icons/enterprise.svg', import.meta.url).href;
    const [svg] = await getSvg({ paths: [iconHref] });
    if (!svg) return;

    const a = document.createElement('a');
    a.href = governanceHref;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = 'Brand governance';
    a.classList.add('nx-link');

    const icon = document.createElement('span');
    icon.className = 'nx-link-icon';
    icon.append(svg);
    a.append(icon);
    a.insertAdjacentHTML('beforeend', '<span class="nx-link-text">AEM Context</span>');

    const li = document.createElement('li');
    li.setAttribute('data-nx-brand-governance', '');
    li.append(a);
    list.append(li);
  }

  async fetchNav() {
    const path = window.location.pathname.startsWith(NEW_UI_PREFIX)
      ? NEW_UI_FRAGMENT_PATH
      : (getMetadata('sidenav-source') || getDefaultPath());
    const resp = await fetch(`${path}.plain.html`);
    if (!resp.ok) return null;
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    await loadArea(doc.body);
    const list = doc.querySelector('ul');
    await this.decorateIcons(list);
    await this.syncBrandGovernanceLink(list);

    const anchors = doc.querySelectorAll('a');
    anchors.forEach((a) => {
      const hashAware = HASH_AWARE.some((name) => name === a.title);
      if (!hashAware) return;
      a.addEventListener('click', (e) => {
        if (window.location.hash?.startsWith('#/')) {
          e.preventDefault();
          const hashPath = window.location.hash.slice(2);
          if (hashPath) {
            const hash = `#/${hashPath}`;
            window.open(`${a.href}${hash}`, `${a.href}${hash}`);
            return;
          }
          window.open(a.href, a.href);
        }
      });
    });

    const inner = document.createElement('div');
    inner.className = 'nx-sidenav-inner';
    inner.append(list);
    return inner;
  }

  async render() {
    this.shadowRoot.append(this.nav);
  }
}

customElements.define('nx-sidenav', SideNav);

export default function init(el) {
  const sidenav = document.createElement('nx-sidenav');
  el.append(sidenav);
}

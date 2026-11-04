import { LitElement, html } from 'da-lit';
import { getConfig, getMetadata } from '../../scripts/nx.js';

import { loadStyle, hashChange } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import { loadHrefSvg } from '../../utils/svg.js';
import { hashStateToPathSegments } from '../shared/breadcrumb/utils.js';

const DEFAULT_NAV_PATH = '/nx/fragments/nav';

const style = await loadStyle(import.meta.url);

async function openFragmentDialog(path) {
  await import('../shared/dialog/dialog.js');
  const fragment = await loadFragment(path);
  if (!fragment) return;
  const dialog = document.createElement('nx-dialog');
  dialog.append(...fragment.children);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
}

class NXNav extends LitElement {
  static properties = {
    path: { attribute: false },
    _brand: { state: true },
    _siteNav: { state: true },
    _actions: { state: true },
    _breadcrumbs: { state: true },
    _hashState: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubHash = hashChange.subscribe((state) => { this._hashState = state; });
    this.loadNav();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
  }

  change(props) {
    if (props.has('path') && this.path) {
      this.loadNav();
    }
  }

  async loadNav() {
    const loadId = Symbol('nav-load');
    this._navLoadId = loadId;
    const path = this._path;
    const fragment = await loadFragment(path).catch((error) => {
      getConfig().log(`Unable to load nav fragment: ${path}`, error);
      return null;
    });
    if (!fragment || this._navLoadId !== loadId) return;
    let sections = [...fragment.querySelectorAll(':scope > .section')];
    if (sections.length === 0) {
      sections = [...fragment.querySelectorAll(':scope > div')];
    }
    if (sections.length === 0) return;

    const siteNavSection = sections.length > 2 ? sections[1] : null;
    const siteNavList = siteNavSection?.querySelector('ul');
    const hasSiteNav = [...(siteNavList?.children ?? [])]
      .some((child) => {
        if (child.firstElementChild?.localName.startsWith('nx-') || child.querySelector('button')) {
          return true;
        }
        const name = child.textContent.trim().toLowerCase();
        return name && name !== 'breadcrumbs' && !child.classList.contains('breadcrumbs');
      });

    const [siteNav, breadcrumbs, brand, actions] = await Promise.all([
      hasSiteNav ? this.decorateNavItems(siteNavSection) : null,
      hasSiteNav ? null : this.decorateBreadcrumbs(fragment).catch((error) => {
        getConfig().log('Unable to load nav breadcrumbs', error);
        return null;
      }),
      this.decorateBrand(sections[0]),
      this.decorateActions(sections[sections.length - 1]),
    ]);
    if (this._navLoadId !== loadId) return;
    this._siteNav = siteNav;
    this._breadcrumbs = breadcrumbs;
    this._brand = brand;
    this._actions = actions;
  }

  async decorateBreadcrumbs(fragment) {
    const existing = fragment.querySelector('nx-breadcrumb');
    const placeholder = existing?.closest('li') ?? existing
      ?? fragment.querySelector('ul > li.breadcrumbs')
      ?? [...fragment.querySelectorAll('ul > li')].find(
        (el) => el.textContent.trim().toLowerCase() === 'breadcrumbs',
      );
    if (!placeholder) return null;

    const href = placeholder.querySelector('a')?.getAttribute('href');
    const baseUrl = href ? new URL(href, window.location.href).href : undefined;
    placeholder.remove();

    await import('../breadcrumb/breadcrumb.js');

    const el = existing ?? document.createElement('nx-breadcrumb');
    el.classList.add('nav-breadcrumb');
    if (baseUrl) el.baseUrl = baseUrl;
    return el;
  }

  async decorateBrand(brandSection) {
    const brandLink = brandSection.querySelector('a');
    if (!brandLink) return null;
    brandLink.classList.add('brand-area');
    const { href, textContent } = brandLink;

    const hasLockup = href.includes('.svg');
    if (hasLockup) {
      brandLink.setAttribute('aria-label', textContent);
      const lockup = await loadHrefSvg(href);
      if (lockup) brandLink.replaceChildren(lockup);
    }
    brandLink.href = '/';

    return brandLink;
  }

  async decorateNavItems(section) {
    const ul = section?.querySelector('ul');
    if (!ul) return null;
    for (const child of [...ul.children]) {
      const button = child.querySelector('button');
      if (!button) {
        const existing = child.firstElementChild;
        const isComponent = existing?.localName.startsWith('nx-');
        const name = isComponent
          ? existing.localName.slice(3) : child.textContent.trim().toLowerCase();
        if (name) {
          try {
            if (!customElements.get(`nx-${name}`)) await import(`../${name}/${name}.js`);
            if (!isComponent) {
              const component = document.createElement(`nx-${name}`);
              const href = child.querySelector('a')?.getAttribute('href');
              if (href) component.baseUrl = new URL(href, window.location.href).href;
              child.replaceChildren(component);
            }
          } catch (error) {
            getConfig().log(`Unable to load nav component: ${name}`, error);
            child.remove();
          }
        }
      } else if (button.dataset.pathname) {
        const hasLabel = [...button.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
        );
        if (hasLabel) button.classList.add('has-label');
        button.addEventListener('click', () => {
          openFragmentDialog(button.dataset.pathname).catch((error) => {
            getConfig().log(`Unable to open nav dialog: ${button.dataset.pathname}`, error);
          });
        });
      }
    }
    return ul;
  }

  async decorateActions(section) {
    const ul = await this.decorateNavItems(section);
    if (!ul) return null;
    // Inject the toggle so every site has it without changing its nav fragment.
    if (!ul.querySelector('nx-editortoggle')) {
      try {
        if (!customElements.get('nx-editortoggle')) await import('../editortoggle/editortoggle.js');
        const li = document.createElement('li');
        li.append(document.createElement('nx-editortoggle'));
        ul.prepend(li);
      } catch (error) {
        getConfig().log('Unable to load nav editor toggle', error);
      }
    }
    return ul;
  }

  get _path() {
    return getMetadata('nav-path') || this.path || DEFAULT_NAV_PATH;
  }

  onSearchSlotChange({ target }) {
    this.toggleAttribute('data-has-search', target.assignedElements().length > 0);
  }

  updated() {
    const breadcrumbs = this._siteNav
      ? [...this._siteNav.querySelectorAll('nx-breadcrumb')] : [this._breadcrumbs].filter(Boolean);
    if (!breadcrumbs.length) return;
    const pathSegments = hashStateToPathSegments(this._hashState);
    breadcrumbs.forEach((breadcrumb) => { breadcrumb.pathSegments = pathSegments; });
  }

  render() {
    return html`
      <div class="brand-cluster">
        ${this._brand}
        <div class="site-nav">${this._siteNav ?? this._breadcrumbs}</div>
      </div>
      <div class="nav-search"><slot name="search" @slotchange=${this.onSearchSlotChange}></slot></div>
      <div class="action-area">
        ${this._actions}
      </div>
    `;
  }
}

customElements.define('nx-nav', NXNav);

import { LitElement, html } from 'da-lit';
import { getMetadata } from '../../scripts/nx.js';

import { loadStyle, hashChange } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import { loadHrefSvg } from '../../utils/svg.js';

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
    _actions: { state: true },
    _breadcrumbs: { state: true },
    _hashState: { state: true },
  };

  _getSegments;

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
    const fragment = await loadFragment(this._path);
    if (!fragment) return;
    let sections = [...fragment.querySelectorAll(':scope > .section')];
    if (sections.length === 0) {
      sections = [...fragment.querySelectorAll(':scope > div')];
    }
    if (sections.length === 0) return;

    this._breadcrumbs = await this.decorateBreadcrumbs(fragment);
    this._brand = await this.decorateBrand(sections[0]);
    this._actions = await this.decorateActions(sections[sections.length - 1]);
  }

  async decorateBreadcrumbs(fragment) {
    const li = fragment.querySelector('ul > li.breadcrumbs')
      ?? [...fragment.querySelectorAll('ul > li')].find(
        (el) => el.textContent.trim().toLowerCase() === 'breadcrumbs',
      );
    if (!li) return null;

    const href = li.querySelector('a')?.getAttribute('href');
    const baseUrl = href ? new URL(href, window.location.href).href : undefined;
    li.remove();

    const [{ hashStateToPathSegments }] = await Promise.all([
      import('../shared/breadcrumb/utils.js'),
      import('../shared/breadcrumb/breadcrumb.js'),
    ]);
    this._getSegments = hashStateToPathSegments;

    const el = document.createElement('nx-breadcrumb');
    el.classList.add('nav-breadcrumb');
    el.baseUrl = baseUrl;
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
      brandLink.textContent = '';
      const lockup = await loadHrefSvg(href);
      brandLink.append(lockup);
    }
    brandLink.href = '/';

    return brandLink;
  }

  async decorateActions(section) {
    const ul = section.querySelector('ul');
    for (const child of ul.children) {
      const button = child.querySelector('button');
      if (!button) {
        const name = child.textContent.trim().toLowerCase();
        await import(`../${name}/${name}.js`);
        const cmp = document.createElement(`nx-${name}`);
        child.replaceChildren(cmp);
      } else if (button.dataset.pathname) {
        const hasLabel = [...button.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
        );
        if (hasLabel) button.classList.add('has-label');
        button.addEventListener('click', () => openFragmentDialog(button.dataset.pathname));
      }
    }
    return ul;
  }

  get _path() {
    return getMetadata('nav-path') || this.path || DEFAULT_NAV_PATH;
  }

  updated() {
    if (!this._breadcrumbs) return;
    this._breadcrumbs.pathSegments = this._getSegments(this._hashState);
  }

  render() {
    return html`
      <div class="brand-cluster">
        ${this._brand}
        ${this._breadcrumbs}
      </div>
      <div class="action-area">
        ${this._actions}
      </div>
    `;
  }
}

customElements.define('nx-nav', NXNav);

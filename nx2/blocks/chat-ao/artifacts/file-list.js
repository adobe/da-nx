import { LitElement, html, nothing } from 'da-lit';
import { hashChange, loadStyle } from '../../../utils/utils.js';
import { registerArtifact } from './registry.js';

const style = await loadStyle(import.meta.url);

function isFile(item) {
  if (!item || typeof item.title !== 'string' || !item.title.trim()
    || typeof item.path !== 'string' || !item.path.startsWith('/')) return false;
  const parts = item.path.slice(1).split('/');
  return parts.length >= 3 && parts.every((part) => (
    // eslint-disable-next-line no-control-regex
    part && part !== '.' && part !== '..' && !/[\s\\?#%:\u0000-\u001f\u007f]/.test(part)
  ));
}

const editorPath = (path) => path.replace(/\.html$/, '');

class NxFileList extends LitElement {
  static properties = {
    data: { attribute: false },
    _currentPath: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubscribeHash = hashChange.subscribe((state) => {
      this._currentPath = editorPath(state?.fullpath ?? '');
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeHash?.();
  }

  _renderFile(item) {
    const path = editorPath(item.path);
    const current = path === this._currentPath;
    return html`
      <li>
        <a href=${`#${path}`} title=${item.path} aria-current=${current ? 'page' : nothing}>
          <svg class="file-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M5 2.5h7l3 3v12H5z M12 2.5v3h3 M7.5 9h5 M7.5 12h5"/>
          </svg>
          <span class="file">
            <span class="title">${item.title}</span>
            <span class="path">${`/${item.path.split('/').slice(3).join('/')}`}</span>
          </span>
          <span class="action">${current ? 'Viewing' : 'Open'}
            ${current ? nothing : html`<span aria-hidden="true">&rarr;</span>`}
          </span>
        </a>
      </li>
    `;
  }

  render() {
    if (!this.data) return nothing;
    const { title, items } = this.data;
    return html`
      <section aria-label=${title}>
        <h3>${title}<span class="count">${items.length}</span></h3>
        ${items.length ? html`
          <ul>
            ${items.map((item) => this._renderFile(item))}
          </ul>` : html`<p class="empty">No files to show.</p>`}
      </section>
    `;
  }
}

if (!customElements.get('nx-file-list')) customElements.define('nx-file-list', NxFileList);

registerArtifact('FileList', ({ title, items }) => {
  if (typeof title !== 'string' || !title.trim()
    || !Array.isArray(items) || !items.every(isFile)) {
    throw new Error('Unsupported FileList content.');
  }
  return html`<nx-file-list .data=${{ title, items }}></nx-file-list>`;
});

import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../scripts/nx.js';
import { loadStyle, DA_ADMIN } from '../../utils/utils.js';
import { formatRelativeDateTime } from '../../utils/format.js';
import { loadIms } from '../../utils/ims.js';
import { daFetch } from '../../utils/api.js';
import '../shared/popover/popover.js';

const { codeBase } = getConfig();
const style = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);

const ACTIONS = {
  'comment-mention': 'mentioned you on',
  'comment-reply': 'replied on',
};

export const actionLabel = ({ type, action }) => action || ACTIONS[type] || 'updated';

const renderIcon = (name) => html`
  <svg aria-hidden="true" viewBox="0 0 20 20"><use href="${codeBase}/img/icons/${name}.svg#icon"></use></svg>`;

export async function fetchNotifications() {
  const resp = await daFetch({ url: `${DA_ADMIN}/notifications` }).catch(() => null);
  if (!resp?.ok) return { error: 'Unable to load notifications', status: resp?.status };
  const json = await resp.json().catch(() => ({}));
  return { notifications: json.notifications ?? [] };
}

function updateNotifications(change, ids) {
  const opts = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ [change]: ids }),
  };
  return daFetch({ url: `${DA_ADMIN}/notifications`, opts }).catch(() => null);
}

class NxNotifications extends LitElement {
  static properties = {
    _items: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.hidden = true;
    this.shadowRoot.adoptedStyleSheets = [style, buttonStyle];
    this._init();
  }

  async _init() {
    const ims = await loadIms().catch(() => null);
    if (!ims?.accessToken) return;
    await this._load();
  }

  async _load() {
    const { notifications, status } = await fetchNotifications();
    if (status === 404) return;
    this.hidden = false;
    this._items = notifications ?? null;
  }

  get _popover() {
    return this.shadowRoot.querySelector('nx-popover');
  }

  _toggle({ currentTarget }) {
    if (this._popover.open) {
      this._popover.close();
      return;
    }
    this._popover.show({ anchor: currentTarget, placement: 'below-end' });
    this._load();
  }

  _markRead(item) {
    if (item.read) return;
    const markRead = (entry) => (entry.id === item.id ? { ...entry, read: true } : entry);
    this._items = this._items.map(markRead);
    updateNotifications('read', [item.id]);
  }

  _dismiss(item) {
    this._items = this._items.filter((entry) => entry.id !== item.id);
    updateNotifications('done', [item.id]);
  }

  _renderItem(item) {
    const actor = item.actor?.name ?? item.actor?.email;
    const page = item.title || item.path;
    return html`
      <li class=${item.read ? 'item' : 'item unread'}>
        <span class="unread-dot" aria-hidden="true"></span>
        <a class="item-link" href=${item.link} target="_blank" rel="noopener" title=${item.path}
          @click=${() => this._markRead(item)}>
          <span class="summary">
            ${item.read ? nothing : html`<span class="sr-only">Unread: </span>`}
            <strong>${actor}</strong> ${actionLabel(item)} <strong>${page}</strong>
          </span>
          ${item.description ? html`<span class="excerpt">${item.description}</span>` : nothing}
          <span class="meta">
            <time datetime=${new Date(item.updatedAt).toISOString()}>${formatRelativeDateTime(item.updatedAt)}</time>
            <span>${item.org}/${item.site}</span>
          </span>
        </a>
        <button class="nx-action-btn-icon nx-btn-sm" type="button" title="Dismiss" aria-label="Dismiss ${page}"
          @click=${() => this._dismiss(item)}>${renderIcon('s2-icon-close-20-n')}</button>
      </li>`;
  }

  _renderBody() {
    if (!this._items) return html`<p class="empty">Notifications couldn't load. Try again later.</p>`;
    if (!this._items.length) return html`<p class="empty">You're all caught up.</p>`;
    return html`<ul class="items">${this._items.map((item) => this._renderItem(item))}</ul>`;
  }

  render() {
    const unread = this._items?.filter((item) => !item.read).length;
    return html`
      <button type="button" class="nx-action-btn-icon trigger" @click=${this._toggle}
        aria-label=${unread ? `Notifications, ${unread} unread` : 'Notifications'}>
        ${renderIcon('s2-icon-bell-20-n')}
        ${unread ? html`<span class="count-chip" aria-hidden="true">${unread}</span>` : nothing}
      </button>
      <nx-popover placement="below-end">
        <h2>Notifications</h2>
        ${this._renderBody()}
      </nx-popover>
    `;
  }
}

customElements.define('nx-notifications', NxNotifications);

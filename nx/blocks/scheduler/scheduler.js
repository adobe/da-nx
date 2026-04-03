import { html, LitElement, nothing } from 'da-lit';
import { AEM_ORIGIN } from '../../public/utils/constants.js';
import getStyle from '../../utils/styles.js';
import { daFetch } from '../../utils/daFetch.js';

import '../../public/sl/components.js';
import '../shared/path/path.js';

const EL_NAME = 'nx-scheduler';
const SCHEDULER_BASE = 'https://helix-snapshot-scheduler-prod.adobeaem.workers.dev';

const styles = await getStyle(import.meta.url);

function formatDate(isoDate) {
  if (!isoDate) return 'No schedule date';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZoneName: 'short',
  });
}

function buildItemLink(org, site, id, type) {
  if (type === 'page') {
    const path = id.startsWith('/') ? id : `/${id}`;
    return `https://main--${site}--${org}.aem.page${path}`;
  }
  return `https://da.live/apps/snapshots?snapshot=${encodeURIComponent(id)}#/${org}/${site}`;
}

function formatDuration(isoDate) {
  if (!isoDate) return '';
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return '';

  const now = Date.now();
  const diff = target.getTime() - now;
  if (diff <= 0) return 'due now';

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `in ${days}d ${remainingHours}h` : `in ${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `in ${hours}h ${remainingMinutes}m` : `in ${hours}h`;
  }
  if (minutes > 0) return `in ${minutes}m`;
  return `in ${seconds}s`;
}

async function getError(resp, fallback) {
  const xError = resp.headers.get('X-Error') || resp.headers.get('x-error');
  if (xError) return xError;
  try {
    const text = await resp.text();
    if (text) return text;
  } catch {
    // no-op
  }
  return fallback;
}

async function checkRegistration(org, site) {
  const resp = await daFetch(`${SCHEDULER_BASE}/register/${org}/${site}`);
  if (resp.status === 200) return { registered: true };
  if (resp.status === 404) return { registered: false };
  return { error: await getError(resp, 'Could not check scheduler registration status.') };
}

async function createApiKey(org, site) {
  const resp = await daFetch(`${AEM_ORIGIN}/config/${org}/sites/${site}/apiKeys.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: 'Scheduler registration', roles: ['publish'] }),
  });
  if (!resp.ok) {
    return { error: await getError(resp, 'Failed to create publish API key.') };
  }

  try {
    return await resp.json();
  } catch {
    return { error: 'Could not parse API key response.' };
  }
}

async function registerSite(org, site, apiKey) {
  const resp = await daFetch(`${SCHEDULER_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org, site, apiKey }),
  });
  if (resp.ok) return { ok: true };
  return { ok: false, error: await getError(resp, 'Failed to register site with scheduler.') };
}

async function clearSnapshotScheduledPublish(org, site, snapshotId) {
  const name = snapshotId.startsWith('/') ? snapshotId.slice(1) : snapshotId;
  const url = `${AEM_ORIGIN}/snapshot/${org}/${site}/main/${name}`;
  const fetchResp = await daFetch(url);
  if (!fetchResp.ok) return { ok: false, error: await getError(fetchResp, 'Could not fetch snapshot manifest.') };
  const { manifest } = await fetchResp.json();
  delete manifest.metadata.scheduledPublish;
  const saveResp = await daFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest),
  });
  if (saveResp.ok) return { ok: true };
  return { ok: false, error: await getError(saveResp, 'Could not update snapshot metadata.') };
}

async function deleteScheduleEntry(org, site, entry) {
  const type = entry.type === 'page' ? 'page' : 'snapshot';
  const idPath = entry.id.startsWith('/') ? entry.id : `/${entry.id}`;
  const url = `${SCHEDULER_BASE}/schedule/${type}/${org}/${site}${idPath}`;
  const resp = await daFetch(url, { method: 'DELETE' });
  if (resp.ok) return { ok: true };
  return { ok: false, error: await getError(resp, `Failed to delete scheduled ${type}.`) };
}

async function fetchSchedule(org, site) {
  const resp = await daFetch(`${SCHEDULER_BASE}/schedule/${org}/${site}`);
  if (!resp.ok) {
    return { error: await getError(resp, 'Could not load scheduled pages and snapshots.') };
  }

  let json;
  try {
    json = await resp.json();
  } catch {
    return { error: 'Could not parse scheduler response.' };
  }

  const key = `${org}--${site}`;
  const items = json[key] || {};
  const entries = Object.entries(items)
    .map(([id, item]) => ({
      id,
      type: item?.type || 'unknown',
      scheduledPublish: item?.scheduledPublish,
      approved: item?.approved,
      userId: item?.userId,
    }))
    .sort((a, b) => new Date(a.scheduledPublish) - new Date(b.scheduledPublish));

  return { entries };
}

class NxScheduler extends LitElement {
  static properties = {
    _org: { state: true },
    _site: { state: true },
    _registered: { state: true },
    _scheduleEntries: { state: true },
    _alert: { state: true },
    _isBusy: { state: true },
    _isLoading: { state: true },
    _deletingId: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  get _path() {
    if (!this._org || !this._site) return '';
    return `/${this._org}/${this._site}`;
  }

  async handleDetail({ detail }) {
    this._org = detail?.org;
    this._site = detail?.site;
    this._registered = undefined;
    this._scheduleEntries = [];
    if (!this._org || !this._site) {
      this._alert = { type: 'warning', message: 'Please enter an org/site path like /my-org/my-site.' };
      return;
    }

    await this.loadSiteState();
  }

  async loadSiteState() {
    const org = this._org;
    const site = this._site;
    if (!org || !site) return;

    const runId = (this._loadRunId || 0) + 1;
    this._loadRunId = runId;
    this._isLoading = true;
    this._scheduleEntries = [];
    this._alert = { type: 'info', message: 'Checking scheduler registration.' };

    const registration = await checkRegistration(org, site);
    if (this._loadRunId !== runId) return;

    if (registration.error) {
      this._registered = undefined;
      this._isLoading = false;
      this._alert = { type: 'warning', message: registration.error };
      return;
    }

    this._registered = registration.registered;
    if (!registration.registered) {
      this._isLoading = false;
      this._alert = {
        type: 'info',
        message: `${org}/${site} is not registered for scheduling. Register this site to enable scheduler actions.`,
      };
      return;
    }

    this._alert = { type: 'info', message: 'Loading scheduled pages and snapshots.' };
    const schedule = await fetchSchedule(org, site);
    if (this._loadRunId !== runId) return;

    this._isLoading = false;
    if (schedule.error) {
      this._alert = { type: 'warning', message: schedule.error };
      return;
    }

    this._scheduleEntries = schedule.entries;
    const count = schedule.entries.length;
    this._alert = count
      ? { type: 'success', message: `Found ${count} scheduled item${count === 1 ? '' : 's'}.` }
      : { type: 'info', message: 'No scheduled pages or snapshots found for this site.' };
  }

  async handleRegister() {
    const { _org: org, _site: site } = this;
    if (!org || !site || this._isBusy || this._registered) return;

    this._isBusy = true;
    this._alert = { type: 'info', message: 'Creating publish API key.' };

    const keyData = await createApiKey(org, site);
    if (keyData.error || !keyData.value) {
      this._isBusy = false;
      this._alert = { type: 'warning', message: keyData.error || 'Failed to create API key.' };
      return;
    }

    this._alert = { type: 'info', message: 'Registering org/site with scheduler.' };
    const registration = await registerSite(org, site, keyData.value);
    this._isBusy = false;

    if (!registration.ok) {
      this._alert = {
        type: 'warning',
        message: `API key created but scheduler registration failed. ${registration.error}`,
      };
      return;
    }

    this._alert = {
      type: 'success',
      message: `${org}/${site} has been registered.`,
    };
    await this.loadSiteState();
  }

  async handleRefresh() {
    await this.loadSiteState();
  }

  handleOpenItem(entry) {
    const url = buildItemLink(this._org, this._site, entry.id, entry.type);
    window.open(url, '_blank');
  }

  async handleDeleteItem(entry) {
    if (this._deletingId) return;
    this._deletingId = entry.id;
    if (entry.type === 'snapshot') {
      const clearResult = await clearSnapshotScheduledPublish(this._org, this._site, entry.id);
      if (!clearResult.ok) {
        this._deletingId = undefined;
        this._alert = { type: 'warning', message: clearResult.error };
        return;
      }
    }
    const result = await deleteScheduleEntry(this._org, this._site, entry);
    this._deletingId = undefined;
    if (!result.ok) {
      this._alert = { type: 'warning', message: result.error };
      return;
    }
    this._scheduleEntries = this._scheduleEntries.filter((e) => e.id !== entry.id);
    const count = this._scheduleEntries.length;
    this._alert = count
      ? { type: 'success', message: `Schedule deleted. ${count} scheduled item${count === 1 ? '' : 's'} remaining.` }
      : { type: 'info', message: 'No scheduled pages or snapshots found for this site.' };
  }

  renderAlert() {
    if (!this._alert) return nothing;
    return html`
      <div class="nx-alert ${this._alert.type || 'info'}">
        <p>${this._alert.message}</p>
      </div>
    `;
  }

  renderStatus() {
    if (!this._org || !this._site) return nothing;

    if (this._registered === true) {
      if (this._isLoading) return nothing;

      return html`
        <div class="status-card">
          <div class="status-actions">
            <sl-button class="primary outline" ?disabled=${this._isLoading} @click=${this.handleRefresh}>
              Refresh schedule
            </sl-button>
          </div>
        </div>
      `;
    }

    const status = this._registered === undefined ? 'Unknown' : 'Not registered';

    if (status === 'Unknown') return nothing;

    return html`
      <div class="status-card">
        <p><b>Site:</b> ${this._path}</p>
        <p><b>Status:</b> ${status}</p>
        ${this._registered === false ? html`
          <sl-button ?disabled=${this._isBusy || this._isLoading} @click=${this.handleRegister}>
            ${this._isBusy ? 'Registering...' : 'Register site'}
          </sl-button>
        ` : nothing}
      </div>
    `;
  }

  renderSchedule() {
    if (this._registered !== true) return nothing;

    if (!this._scheduleEntries?.length) return nothing;

    return html`
      <div class="schedule-list">
        <div class="schedule-list-header">
          <p>Type</p>
          <p>Item</p>
          <p>Publishes on</p>
          <p>Requested by</p>
          <p>Actions</p>
        </div>
        ${this._scheduleEntries.map((entry) => html`
          <div class="schedule-row">
            <p>${entry.type === 'page' ? 'Page' : 'Snapshot'}</p>
            <p class="item-id">${entry.id}</p>
            <p>
              ${formatDate(entry.scheduledPublish)}
              <span class="duration">${formatDuration(entry.scheduledPublish)}</span>
            </p>
            <p class="scheduled-by">${entry.userId || '—'}</p>
            <div class="schedule-actions">
              <sl-button class="primary outline" @click=${() => this.handleOpenItem(entry)}>Open</sl-button>
              <sl-button class="negative outline" ?disabled=${this._deletingId === entry.id} @click=${() => this.handleDeleteItem(entry)}>
                ${this._deletingId === entry.id ? 'Deleting...' : 'Delete'}
              </sl-button>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  render() {
    return html`
      <nx-path label="Load schedules" @details=${this.handleDetail}></nx-path>
      <div class="scheduler-header">
        <h1>Schedule Publish</h1>
        <p>View scheduled pages and snapshots for a site.</p>
      </div>
      ${this.renderAlert()}
      ${this.renderStatus()}
      ${this.renderSchedule()}
    `;
  }
}

customElements.define(EL_NAME, NxScheduler);

export default function init(el) {
  el.replaceChildren();
  const cmp = document.createElement(EL_NAME);
  el.append(cmp);
}

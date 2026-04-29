import { daFetch } from './fetch.js';

export default class DaLegacyApi {
  constructor(origin) {
    this.origin = origin;
    this.apiVersion = 'legacy';
  }

  getSourceUrl(path) { return `${this.origin}/source${path}`; }

  getConfigUrl(path) { return `${this.origin}/config${path}`; }

  getListUrl(path) { return `${this.origin}/list${path}`; }

  getVersionListUrl(path) { return `${this.origin}/versionlist${path}`; }

  getVersionSourceUrl(path) { return `${this.origin}/versionsource${path}`; }

  async getSource(path, opts = {}) {
    return daFetch(this.getSourceUrl(path), opts);
  }

  async deleteSource(path) {
    return daFetch(this.getSourceUrl(path), { method: 'DELETE' });
  }

  async saveSource(path, { formData, blob, props, method = 'PUT' } = {}) {
    const opts = { method };
    const form = formData || new FormData();
    if (blob || props) {
      if (blob) form.append('data', blob);
      if (props) form.append('props', JSON.stringify(props));
    }
    if ([...form.keys()].length) opts.body = form;
    return daFetch(this.getSourceUrl(path), opts);
  }

  async getConfig(path, opts) {
    return daFetch(this.getConfigUrl(path), opts);
  }

  async saveConfig(path, body) {
    const form = body instanceof FormData ? body : new FormData();
    if (!(body instanceof FormData) && body) {
      form.append('config', typeof body === 'string' ? body : JSON.stringify(body));
    }
    return daFetch(this.getConfigUrl(path), { method: 'PUT', body: form });
  }

  // Returns { ok, status, permissions, items, continuationToken }
  // items: [{ name, ext, lastModified, path }]
  async getList(path, { continuationToken } = {}) {
    const opts = continuationToken
      ? { headers: { 'da-continuation-token': continuationToken } }
      : {};
    const resp = await daFetch(this.getListUrl(path), opts);
    const out = {
      ok: resp.ok,
      status: resp.status,
      permissions: resp.permissions,
      items: [],
      continuationToken: null,
    };
    if (!resp.ok) return out;
    const json = await resp.json();
    const items = Array.isArray(json) ? json : (json?.items || []);
    out.continuationToken = resp.headers?.get('da-continuation-token')
      || json?.continuationToken
      || null;
    out.items = items.map((item) => ({
      name: item.name,
      ext: item.ext,
      lastModified: item.lastModified,
      path: item.path,
    }));
    return out;
  }

  async move(srcPath, destPath, continuationToken) {
    const body = new FormData();
    body.append('destination', destPath);
    if (continuationToken) body.append('continuation-token', continuationToken);
    return daFetch(`${this.origin}/move${srcPath}`, { method: 'POST', body });
  }

  async copy(srcPath, destPath, continuationToken) {
    const body = new FormData();
    body.append('destination', destPath);
    if (continuationToken) body.append('continuation-token', continuationToken);
    return daFetch(`${this.origin}/copy${srcPath}`, { method: 'POST', body });
  }

  // Returns { ok, status, items: [{ id, label, timestamp, author, url }] }
  async getVersionList(path) {
    const resp = await daFetch(this.getVersionListUrl(path));
    const out = { ok: resp.ok, status: resp.status, items: [] };
    if (!resp.ok) return out;
    const json = await resp.json();
    out.items = json.map((v) => {
      let url;
      if (v.url) url = v.url.startsWith('http') ? v.url : `${this.origin}${v.url}`;
      return {
        id: v.id ?? v.timestamp,
        label: v.label,
        timestamp: v.timestamp,
        author: v.users?.[0]?.email ?? v.author,
        users: v.users,
        url,
        raw: v,
      };
    });
    return out;
  }

  async getVersion(path) {
    return daFetch(this.getVersionSourceUrl(path));
  }

  async createVersion(path, { label } = {}) {
    const opts = { method: 'POST' };
    if (label) opts.body = JSON.stringify({ label });
    return daFetch(this.getVersionSourceUrl(path), opts);
  }
}

import { daFetch } from './fetch.js';

function parsePath(path) {
  const parts = path.split('/').filter((p) => p !== '');
  const trailing = path.endsWith('/');
  return {
    org: parts[0],
    site: parts[1],
    rest: parts.slice(2).join('/'),
    trailing,
  };
}

function splitExt(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { name, ext: undefined };
  return { name: name.slice(0, dot), ext: name.slice(dot + 1) };
}

export default class DaHelix6Api {
  constructor(origin) {
    this.origin = origin;
    this.apiVersion = 'helix6';
  }

  // Build /{org}/sites/{site}/source/{rest}, preserving trailing slash for folders.
  getSourceUrl(path) {
    const { org, site, rest, trailing } = parsePath(path);
    if (!site) return `${this.origin}/${org}/sites/source`;
    const base = `${this.origin}/${org}/sites/${site}/source`;
    if (!rest) return `${base}${trailing ? '/' : ''}`;
    return `${base}/${rest}${trailing ? '/' : ''}`;
  }

  getConfigUrl(path) {
    const { org, site } = parsePath(path);
    if (!org) return `${this.origin}/config.json`;
    if (!site) return `${this.origin}/${org}/config.json`;
    return `${this.origin}/${org}/sites/${site}/config.json`;
  }

  // helix6 lists via the source endpoint with trailing slash.
  getListUrl(path) {
    const withSlash = path.endsWith('/') ? path : `${path}/`;
    return this.getSourceUrl(withSlash);
  }

  getVersionListUrl(path) {
    return `${this.getSourceUrl(path)}/.versions`;
  }

  getVersionSourceUrl(path) {
    return `${this.getSourceUrl(path)}/.versions`;
  }

  async getSource(path, opts = {}) {
    return daFetch(this.getSourceUrl(path), opts);
  }

  async deleteSource(path) {
    return daFetch(this.getSourceUrl(path), { method: 'DELETE' });
  }

  // helix6 takes the raw blob as the body (not multipart). PUT skips image
  // interning; POST interns external images.
  async saveSource(path, { blob, formData, props, method = 'PUT' } = {}) {
    let body;
    if (blob) {
      body = blob;
    } else if (formData) {
      // Best-effort: pull the data field if present, else send the formData as-is.
      body = formData.get('data') || formData;
    } else if (props) {
      body = new Blob([JSON.stringify(props)], { type: 'application/json' });
    }
    return daFetch(this.getSourceUrl(path), { method, body });
  }

  async getConfig(path, opts) {
    return daFetch(this.getConfigUrl(path), opts);
  }

  async saveConfig(path, body) {
    let payload = body;
    if (body instanceof FormData) payload = body.get('config') || body.get('data') || body;
    if (typeof payload === 'object' && !(payload instanceof Blob)) {
      payload = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    }
    return daFetch(this.getConfigUrl(path), { method: 'PUT', body: payload });
  }

  // Returns { ok, status, permissions, items, continuationToken }
  // helix6 does not paginate — continuationToken is always null.
  async getList(path) {
    const resp = await daFetch(this.getListUrl(path));
    const out = {
      ok: resp.ok,
      status: resp.status,
      permissions: resp.permissions,
      items: [],
      continuationToken: null,
    };
    if (!resp.ok) return out;
    const json = await resp.json();
    const basePath = path.endsWith('/') ? path.slice(0, -1) : path;
    out.items = json.map((item) => {
      const isFolder = item['content-type'] === 'application/folder';
      const { name, ext } = isFolder ? { name: item.name, ext: undefined } : splitExt(item.name);
      const lastModified = item['last-modified'] ? new Date(item['last-modified']).getTime() : undefined;
      return { name, ext, lastModified, path: `${basePath}/${item.name}` };
    });
    return out;
  }

  // helix6: PUT to dest with ?source={srcPath} (& optional &move=true)
  async move(srcPath, destPath) {
    const url = `${this.getSourceUrl(destPath)}?source=${encodeURIComponent(srcPath)}&move=true`;
    return daFetch(url, { method: 'PUT' });
  }

  async copy(srcPath, destPath) {
    const url = `${this.getSourceUrl(destPath)}?source=${encodeURIComponent(srcPath)}`;
    return daFetch(url, { method: 'PUT' });
  }

  // Returns { ok, status, items: [{ id, label, timestamp, author, url }] }
  async getVersionList(path) {
    const resp = await daFetch(this.getVersionListUrl(path));
    const out = { ok: resp.ok, status: resp.status, items: [] };
    if (!resp.ok) return out;
    const json = await resp.json();
    out.items = json.map((v) => ({
      id: v.version,
      label: v['version-comment'] ?? v['version-operation'],
      timestamp: v['version-date'] ? new Date(v['version-date']).getTime() : undefined,
      author: v['version-by'],
      // Synthesize a `users` array so legacy UI templates render uniformly.
      users: v['version-by'] ? [{ email: v['version-by'] }] : [],
      url: `${this.getSourceUrl(path)}/.versions/${v.version}`,
      raw: v,
    }));
    return out;
  }

  async getVersion(path, versionId) {
    return daFetch(`${this.getSourceUrl(path)}/.versions/${versionId}`);
  }

  async createVersion(path, { label } = {}) {
    const body = JSON.stringify({ operation: 'version', comment: label });
    return daFetch(this.getVersionListUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }
}

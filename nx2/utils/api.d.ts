/**
 * Type declarations for nx2/utils/api.js
 *
 * Every namespace method accepts either an object form
 * `{ org, site, path, ...extras }` or a path-string form
 * `'/org/site/file/path'` (with extras passed as the second arg).
 */

/** A `Response` augmented with parsed permission hints from x-da-(child-)actions. */
export interface ApiResponse extends Response {
  permissions: string[];
}

/** Normalized return shape for `source.list`. Items are always in the
 * legacy `{ name, ext, path, lastModified, ... }` form regardless of whether
 * the server is hlx6 (content-type entries) or legacy DA. */
export interface ListResult {
  ok: boolean;
  /** Normalized children. Empty when `ok` is false. */
  items: Array<{ name: string; path: string; ext?: string; lastModified?: number; contentType?: string }>;
  /** Pass back in the method's `continuationToken` arg for the next page. Null when there's no more. */
  continuationToken: string | null;
  /** Same hint as `ApiResponse.permissions`. */
  permissions?: string[];
}

/** Normalized return shape for `source.delete` / `source.copy` / `source.move`. */
export interface ActionResult {
  ok: boolean;
  status: number;
}

/** Normalized return shape for `source.getMetadata`. The value of a HEAD
 * request IS the headers (doc-id, last-modified, etc.). */
export interface MetadataResult {
  ok: boolean;
  status: number;
  headers: Headers;
}

// ─── low-level ──────────────────────────────────────────────────────────────

export function daFetch(args: {
  url: string;
  opts?: RequestInit;
  redirect?: boolean;
}): Promise<ApiResponse>;

export function isHlx6(org: string, site: string): Promise<boolean>;

export function signout(): void;

/** Split `/org/site/file/path` into `{ org, site, path }`. */
export function fromPath(fullPath: string): { org: string; site: string; path: string };

// ─── source ─────────────────────────────────────────────────────────────────

export const source: {
  /**
   * Load a document. Accepts either calling style:
   *
   * - **Object:** `load({ org, site, path? })`
   * - **Path:** `load('/org/site/file/path')`
   *
   * Returns an augmented `Response` — use `resp.text()`, `resp.json()`, etc.
   *
   * @param arg Path string (`/org/site/file/path`) or `{ org, site, path? }`
   */
  load(arg: any): Promise<ApiResponse>;

  /**
   * List folder contents. Accepts either calling style:
   *
   * - **Object:** `list({ org, site?, path?, continuationToken?, opts? })`
   * - **Path:** `list('/org/site/folder', { continuationToken?, opts? })`
   *
   * Pass `{ org }` without `site` to list sites at the org level (legacy DA only).
   * For pagination, pass `continuationToken` from a prior result.
   *
   * Returns `{ ok, items, continuationToken, permissions? }`.
   *
   * @param arg Path string (`/org/site/folder`) or `{ org, site?, path?, continuationToken?, opts? }`
   * @param pathExtras Path-form only — `{ continuationToken?, opts? }`
   */
  list(arg: any, pathExtras?: object): Promise<ListResult>;

  /**
   * Save a document. Accepts either calling style:
   *
   * - **Object:** `save({ org, site, path, data })`
   * - **Path:** `save('/org/site/file/path', { data })`
   *
   * `data` is file contents (string, Blob, or File). On hlx6, `Content-Type` is
   * set from the path extension (see `TYPE_MAP`).
   *
   * Returns an augmented `Response`.
   *
   * @param arg Path string (`/org/site/file/path`) or `{ org, site, path, data }`
   * @param pathExtras Path-form only — `{ data }` (required)
   */
  save(arg: any, pathExtras?: object): Promise<ApiResponse>;

  /**
   * HEAD request for document metadata. Accepts either calling style:
   *
   * - **Object:** `getMetadata({ org, site, path })`
   * - **Path:** `getMetadata('/org/site/file/path')`
   *
   * Returns `{ ok, status, headers }` — `headers` is the raw `Headers` object.
   *
   * @param arg Path string (`/org/site/file/path`) or `{ org, site, path }`
   */
  getMetadata(arg: any): Promise<MetadataResult>;

  /**
   * Delete a document. Accepts either calling style:
   *
   * - **Object:** `delete({ org, site, path })`
   * - **Path:** `delete('/org/site/file/path')`
   *
   * Returns `{ ok, status }` (204 on success, empty body). For recursive folder
   * deletion use `deleteFolder`.
   *
   * @param arg Path string (`/org/site/file/path`) or `{ org, site, path }`
   */
  delete(arg: any): Promise<ActionResult>;

  /**
   * Copy a document. Accepts either calling style:
   *
   * - **Object:** `copy({ org, site, path, destination, collision? })`
   * - **Path:** `copy('/org/site/source/path', { destination, collision? })`
   *
   * `path` is the source file; `destination` is the target path (leading-slash).
   * `collision` sets conflict policy when the destination exists (e.g. `'overwrite'`).
   *
   * Returns `{ ok, status }`.
   *
   * @param arg Path string (source `/org/site/file/path`) or object form above
   * @param pathExtras Path-form only — `{ destination, collision? }`
   */
  copy(arg: any, pathExtras?: object): Promise<ActionResult>;

  /**
   * Move a document. Accepts either calling style:
   *
   * - **Object:** `move({ org, site, path, destination, collision? })`
   * - **Path:** `move('/org/site/source/path', { destination, collision? })`
   *
   * `path` is the source file; `destination` is the target path (leading-slash).
   * `collision` sets conflict policy when the destination exists (e.g. `'overwrite'`).
   *
   * Returns `{ ok, status }`.
   *
   * @param arg Path string (source `/org/site/file/path`) or object form above
   * @param pathExtras Path-form only — `{ destination, collision? }`
   */
  move(arg: any, pathExtras?: object): Promise<ActionResult>;

  /**
   * Create a folder. Accepts either calling style:
   *
   * - **Object:** `createFolder({ org, site, path })`
   * - **Path:** `createFolder('/org/site/folder')`
   *
   * Returns an augmented `Response`.
   *
   * @param arg Path string (`/org/site/folder`) or `{ org, site, path }`
   */
  createFolder(arg: any): Promise<ApiResponse>;

  /**
   * Delete a folder. Accepts either calling style:
   *
   * - **Object:** `deleteFolder({ org, site, path })`
   * - **Path:** `deleteFolder('/org/site/folder')`
   *
   * Returns an augmented `Response`.
   *
   * @param arg Path string (`/org/site/folder`) or `{ org, site, path }`
   */
  deleteFolder(arg: any): Promise<ApiResponse>;
};

// ─── versions ───────────────────────────────────────────────────────────────

export const versions: {
  list(arg: { org: string; site: string; path: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  list(fullPath: string): Promise<ApiResponse>;

  get(arg: {
    org: string;
    site: string;
    path: string;
    /** ULID on hlx6; `{versionGuid}/{fileGuid}.{ext}` segment on legacy DA. */
    versionId: string;
  }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  get(
    fullPath: string,
    extras: {
      /** ULID on hlx6; `{versionGuid}/{fileGuid}.{ext}` segment on legacy DA. */
      versionId: string;
    },
  ): Promise<ApiResponse>;

  create(arg: {
    org: string;
    site: string;
    path: string;
    /** Operation that triggered the version (e.g. `'preview'`). */
    operation?: string;
    /** Optional human-readable label/comment for the version. */
    comment?: string;
  }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  create(
    fullPath: string,
    extras?: {
      /** Operation that triggered the version (e.g. `'preview'`). */
      operation?: string;
      /** Optional human-readable label/comment for the version. */
      comment?: string;
    },
  ): Promise<ApiResponse>;
};

// ─── config ─────────────────────────────────────────────────────────────────

export const config: {
  get(arg: { org: string; site?: string }): Promise<ApiResponse>;
  put(arg: {
    org: string;
    site?: string;
    /** Config payload (typically a JSON Blob or string). */
    body: BodyInit;
  }): Promise<ApiResponse>;
  delete(arg: { org: string; site?: string }): Promise<ApiResponse>;
  /** hlx6 only; returns `{ error, status: 501 }` on legacy. */
  getAggregated(arg: { org: string; site: string }): Promise<ApiResponse | { error: string; status: 501 }>;
};

// ─── org ────────────────────────────────────────────────────────────────────

export const org: {
  listSites(arg: { org: string }): Promise<ApiResponse>;
};

// ─── status ────────────────────────────────────────────────────────────────

export const status: {
  /** Single-path only. H6 has no bulk status endpoint. Returns parsed JSON
   * (typically `{ preview, live, edit, ... }`) or `undefined` when the
   * response is not ok or the body fails to parse. */
  get(arg: { org: string; site: string; path: string }): Promise<unknown | undefined>;
  /** `fullPath` is a `/org/site/file/path` string. */
  get(fullPath: string): Promise<unknown | undefined>;
};

// ─── aem (preview + live) ───────────────────────────────────────────────────

/** Parsed JSON from a single-path aem call when `returnJson` is true (default). */
export type AemJson = unknown;

export const aem: {
  /**
   * GET preview status (single path only). Accepts either calling style:
   *
   * - **Object:** `getPreview({ org, site, path, returnJson? })`
   * - **Path:** `getPreview('/org/site/file/path', { returnJson? })`
   *
   * Default: parsed JSON; `undefined` when the response is not ok or fails to parse.
   * Set `returnJson: false` for the raw augmented `Response`.
   *
   * @param arg Path string (`/org/site/file/path`) or `{ org, site, path, returnJson? }`
   * @param pathExtras Path-form only — `{ returnJson? }`
   */
  getPreview(arg: any, pathExtras?: object): Promise<AemJson | undefined | ApiResponse>;

  /**
   * GET publish status (single path only). Accepts either calling style:
   *
   * - **Object:** `getPublish({ org, site, path, returnJson? })`
   * - **Path:** `getPublish('/org/site/file/path', { returnJson? })`
   *
   * Default: parsed JSON; `undefined` when the response is not ok or fails to parse.
   * Set `returnJson: false` for the raw augmented `Response`.
   *
   * @param arg Path string (`/org/site/file/path`) or `{ org, site, path, returnJson? }`
   * @param pathExtras Path-form only — `{ returnJson? }`
   */
  getPublish(arg: any, pathExtras?: object): Promise<AemJson | undefined | ApiResponse>;

  /**
   * Update preview. Accepts either calling style:
   *
   * - **Object:** `preview({ org, site, path, forceUpdate?, forceSync?, returnJson? })`
   * - **Path:** `preview('/org/site/file/path', { forceUpdate?, forceSync?, returnJson? })`
   *
   * `path` as a string (or one-item array) hits the single-path endpoint.
   * `path` as an array of length ≥ 2 routes to the bulk `/*` endpoint
   * (always returns an augmented `Response`; `returnJson` does not apply).
   * `forceUpdate` and `forceSync` are bulk-only — the server ignores them on single-path calls.
   *
   * Default: parsed JSON on single-path success; `undefined` when not ok.
   * Set `returnJson: false` for the raw augmented `Response` on single-path calls.
   *
   * @param arg Path string, object form above, or bulk object with `path: string[]`
   * @param pathExtras Path-form only — `{ forceUpdate?, forceSync?, returnJson? }`
   */
  preview(arg: any, pathExtras?: object): Promise<AemJson | undefined | ApiResponse>;

  /**
   * Remove from preview. Accepts either calling style:
   *
   * - **Object:** `unPreview({ org, site, path, returnJson? })`
   * - **Path:** `unPreview('/org/site/file/path', { returnJson? })`
   *
   * `path` as a string (or one-item array) → DELETE `/preview/{path}`.
   * `path` as an array of length ≥ 2 → POST `/preview/.../*` with `{ paths, delete: true }`
   * (always returns an augmented `Response`; `returnJson` does not apply).
   *
   * Default: `{ ok, status }` on single-path success (204); `undefined` otherwise.
   * Set `returnJson: false` for the raw augmented `Response` on single-path calls.
   *
   * @param arg Path string, object form above, or bulk object with `path: string[]`
   * @param pathExtras Path-form only — `{ returnJson? }`
   */
  unPreview(arg: any, pathExtras?: object): Promise<ActionResult | undefined | ApiResponse>;

  /**
   * Publish. Accepts either calling style:
   *
   * - **Object:** `publish({ org, site, path, forceUpdate?, forceSync?, returnJson? })`
   * - **Path:** `publish('/org/site/file/path', { forceUpdate?, forceSync?, returnJson? })`
   *
   * `path` as a string (or one-item array) hits the single-path endpoint.
   * `path` as an array of length ≥ 2 routes to the bulk `/*` endpoint
   * (always returns an augmented `Response`; `returnJson` does not apply).
   * `forceUpdate` and `forceSync` are bulk-only — the server ignores them on single-path calls.
   *
   * Default: parsed JSON on single-path success; `undefined` when not ok.
   * Set `returnJson: false` for the raw augmented `Response` on single-path calls.
   *
   * @param arg Path string, object form above, or bulk object with `path: string[]`
   * @param pathExtras Path-form only — `{ forceUpdate?, forceSync?, returnJson? }`
   */
  publish(arg: any, pathExtras?: object): Promise<AemJson | undefined | ApiResponse>;

  /**
   * Unpublish. Accepts either calling style:
   *
   * - **Object:** `unPublish({ org, site, path, returnJson? })`
   * - **Path:** `unPublish('/org/site/file/path', { returnJson? })`
   *
   * `path` as a string (or one-item array) → DELETE `/live/{path}`.
   * `path` as an array of length ≥ 2 → POST `/live/.../*` with `{ paths, delete: true }`
   * (always returns an augmented `Response`; `returnJson` does not apply).
   *
   * Default: `{ ok, status }` on single-path success (204); `undefined` otherwise.
   * Set `returnJson: false` for the raw augmented `Response` on single-path calls.
   *
   * @param arg Path string, object form above, or bulk object with `path: string[]`
   * @param pathExtras Path-form only — `{ returnJson? }`
   */
  unPublish(arg: any, pathExtras?: object): Promise<ActionResult | undefined | ApiResponse>;
};

// ─── snapshot ───────────────────────────────────────────────────────────────

export const snapshot: {
  list(arg: { org: string; site: string }): Promise<ApiResponse>;
  get(arg: { org: string; site: string; snapshotId: string }): Promise<ApiResponse>;
  update(arg: {
    org: string;
    site: string;
    snapshotId: string;
    /** Manifest payload to write to the snapshot. */
    body?: any;
  }): Promise<ApiResponse>;
  delete(arg: { org: string; site: string; snapshotId: string }): Promise<ApiResponse>;
  /** Add path(s). `path` array of 2+ → bulk. */
  addPath(arg: {
    org: string;
    site: string;
    snapshotId: string;
    path: string | string[];
  }): Promise<ApiResponse>;
  /** Remove path(s). `path` array of 2+ → bulk with `{ delete: true }`. */
  removePath(arg: {
    org: string;
    site: string;
    snapshotId: string;
    path: string | string[];
  }): Promise<ApiResponse>;
  publish(arg: { org: string; site: string; snapshotId: string }): Promise<ApiResponse>;
  review(arg: {
    org: string;
    site: string;
    snapshotId: string;
    /** Review state to transition to. */
    action: 'request' | 'approve' | 'reject';
  }): Promise<ApiResponse>;
};

// ─── jobs ───────────────────────────────────────────────────────────────────

export const jobs: {
  /** Omit `name` to list jobs for the topic. */
  get(arg: {
    org: string;
    site: string;
    /** Job topic (e.g. `'preview'`, `'publish'`). */
    topic: string;
    /** Job name/id; omit to list all jobs in the topic. */
    name?: string;
  }): Promise<ApiResponse>;
  details(arg: {
    org: string;
    site: string;
    /** Job topic (e.g. `'preview'`, `'publish'`). */
    topic: string;
    /** Job name/id. */
    name: string;
  }): Promise<ApiResponse>;
  stop(arg: {
    org: string;
    site: string;
    /** Job topic (e.g. `'preview'`, `'publish'`). */
    topic: string;
    /** Job name/id. */
    name: string;
  }): Promise<ApiResponse>;
};

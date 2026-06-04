/**
 * Type declarations for nx2/utils/api.js
 *
 * Every namespace method accepts either an object form
 * `{ org, site, path, ...extras }` or a path-string form
 * `'/org/site/file/path'` (with extras passed as the second arg).
 *
 * Returns: all namespace methods return a raw `Response` augmented with
 * `resp.permissions: string[]` — EXCEPT `source.list`, which merges body
 * + header continuation token + normalized items into a `ListResult`.
 *
 * Opt-in helpers `asJson` / `asText` unwrap a method promise into
 * `{ ok, data, status, error }`. `data` is the parsed body (populated on
 * non-ok responses when parseable). For a plain boolean ok-check, destructure
 * directly: `const { ok } = await foo()`.
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

// ─── response helpers ──────────────────────────────────────────────────────

/** Failure reason returned by `asJson` / `asText` when `ok` is false. */
export type UnwrapError = 'no-response' | 'not-ok' | 'parse-failed';

/** Flat result shape returned by `asJson` / `asText`.
 *
 * - `ok` mirrors `resp.ok`.
 * - `data` is the parsed body. Populated even on non-ok when the error
 *   response had a parseable body (matches axios). `null` when the body
 *   could not be parsed or there is no response.
 * - `status` is the HTTP status (`0` for no response).
 * - `error` is `null` on success, otherwise an `UnwrapError` discriminator.
 */
export interface UnwrapResult<T> {
  ok: boolean;
  data: T | null;
  status: number;
  error: UnwrapError | null;
}

export function asJson<T = unknown>(promise: Promise<Response | unknown>): Promise<UnwrapResult<T>>;
export function asText(promise: Promise<Response | unknown>): Promise<UnwrapResult<string>>;


// ─── source ─────────────────────────────────────────────────────────────────

export const source: {
  /**
   * Get a document. Accepts either calling style:
   *
   * - **Object:** `get({ org, site, path? })`
   * - **Path:** `get('/org/site/file/path')`
   *
   * Returns an augmented `Response` — use `resp.text()`, `resp.json()`, etc.
   *
   * @param arg Path string (`/org/site/file/path`) or `{ org, site, path? }`
   */
  get(arg: any): Promise<ApiResponse>;

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
   * - **Object:** `save({ org, site, path, body })`
   * - **Path:** `save('/org/site/file/path', { body })`
   *
   * `body` is file contents (string, Blob, or File). `Content-Type` is set
   * from the path extension via `TYPE_MAP`. On legacy DA, `body` is wrapped
   * in a `multipart/form-data` field named `data`.
   *
   * Returns an augmented `Response`.
   */
  save(arg: any, pathExtras?: object): Promise<ApiResponse>;

  /**
   * HEAD request for document metadata. Returns an augmented `Response` —
   * the value is in `resp.headers` (doc-id, last-modified, etc.).
   */
  getMetadata(arg: any): Promise<ApiResponse>;

  /**
   * Delete a document. Returns an augmented `Response` (204 on success,
   * empty body). For recursive folder deletion use `deleteFolder`.
   */
  delete(arg: any): Promise<ApiResponse>;

  /**
   * Copy a document. `path` is the source file; `destination` is the target
   * path (leading-slash). `collision` sets conflict policy when the destination
   * exists (e.g. `'overwrite'`). Returns an augmented `Response`.
   */
  copy(arg: any, pathExtras?: object): Promise<ApiResponse>;

  /**
   * Move a document. Same shape as `copy`. Returns an augmented `Response`.
   */
  move(arg: any, pathExtras?: object): Promise<ApiResponse>;

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
  save(arg: {
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
  /** Single-path only. H6 has no bulk status endpoint. Returns an augmented
   * `Response` — parse with `await resp.json()` or `asJson(status.get(...))`. */
  get(arg: { org: string; site: string; path: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  get(fullPath: string): Promise<ApiResponse>;
};

// ─── aem (preview + live) ───────────────────────────────────────────────────

export const aem: {
  /** GET preview status (single path only). Returns augmented `Response`. */
  getPreview(arg: any, pathExtras?: object): Promise<ApiResponse>;
  /** GET publish status (single path only). Returns augmented `Response`. */
  getPublish(arg: any, pathExtras?: object): Promise<ApiResponse>;
  /** Update preview. `path` string → single-path POST. `path` string[] of 2+ →
   * bulk POST to `/*` with `{ paths, forceUpdate?, forceSync? }` body.
   * `forceUpdate` / `forceSync` are bulk-only. Returns augmented `Response`. */
  preview(arg: any, pathExtras?: object): Promise<ApiResponse>;
  /** Remove from preview. `path` string → DELETE. Array of 2+ → POST `/*`
   * with `{ paths, delete: true }`. Returns augmented `Response`. */
  unPreview(arg: any, pathExtras?: object): Promise<ApiResponse>;
  /** Publish. Same shape as `preview`. Returns augmented `Response`. */
  publish(arg: any, pathExtras?: object): Promise<ApiResponse>;
  /** Unpublish. Same shape as `unPreview`. Returns augmented `Response`. */
  unPublish(arg: any, pathExtras?: object): Promise<ApiResponse>;
};

// ─── snapshot ───────────────────────────────────────────────────────────────

export const snapshot: {
  list(arg: { org: string; site: string }): Promise<ApiResponse>;
  get(arg: { org: string; site: string; snapshotId: string }): Promise<ApiResponse>;
  save(arg: {
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

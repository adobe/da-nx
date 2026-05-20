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
  /** Pass back in `opts.headers['da-continuation-token']` for the next page. Null when there's no more. */
  continuationToken: string | null;
  /** Same hint as `ApiResponse.permissions`. */
  permissions?: string[];
}

/** Normalized return shape for `source.delete` / `source.copy` / `source.move`.
 * Bulk operations paginate via `continuationToken`; pass it back via the
 * method's `continuationToken` arg to fetch the next page. */
export interface ActionResult {
  ok: boolean;
  status: number;
  continuationToken: string | null;
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
  load(arg: { org: string; site: string; path?: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  load(fullPath: string): Promise<ApiResponse>;

  /**
   * List a folder. Pass `{ org }` (no site) to list sites at the org level —
   * this falls back to DA-legacy `/list/{org}` (no hlx6 equivalent).
   * Pass `opts.headers['da-continuation-token']` to request a subsequent page.
   */
  list(arg: {
    org: string;
    site?: string;
    path?: string;
    /** Extra fetch options (e.g., pagination headers). */
    opts?: RequestInit;
  }): Promise<ListResult>;
  /** `fullPath` is a `/org/site/folder` string (omit trailing file for root). */
  list(fullPath: string, extras?: { opts?: RequestInit }): Promise<ListResult>;

  save(arg: {
    org: string;
    site: string;
    path: string;
    /**
     * File contents to upload. String, Blob, or File. On hlx6, the
     * `Content-Type` header is set from the path extension (see TYPE_MAP)
     * and overrides any auto-applied Blob type.
     */
    data: BodyInit;
  }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  save(
    fullPath: string,
    extras: {
      /** File contents to upload. See object-form docs above. */
      data: BodyInit;
    },
  ): Promise<ApiResponse>;

  /** HEAD request — returns `{ ok, status, headers }`. */
  getMetadata(arg: { org: string; site: string; path: string }): Promise<MetadataResult>;
  /** `fullPath` is a `/org/site/file/path` string. */
  getMetadata(fullPath: string): Promise<MetadataResult>;

  /** Bulk delete. Pass back `continuationToken` from the previous result to fetch the next page. */
  delete(arg: {
    org: string;
    site: string;
    path: string;
    continuationToken?: string;
  }): Promise<ActionResult>;
  /** `fullPath` is a `/org/site/file/path` string. */
  delete(fullPath: string, extras?: { continuationToken?: string }): Promise<ActionResult>;

  /** Copy. Paginates via `continuationToken` for large trees. */
  copy(arg: {
    org: string;
    site: string;
    /** Source file path (leading-slash). */
    path: string;
    /** Destination file path (leading-slash). */
    destination: string;
    /** Conflict policy when destination exists. e.g. `'overwrite'`. */
    collision?: 'overwrite' | string;
    /** Pagination token from a previous `copy` result. */
    continuationToken?: string;
  }): Promise<ActionResult>;
  /** `fullPath` is the source `/org/site/file/path` string. */
  copy(
    fullPath: string,
    extras: {
      /** Destination file path (leading-slash). */
      destination: string;
      /** Conflict policy when destination exists. e.g. `'overwrite'`. */
      collision?: string;
      continuationToken?: string;
    },
  ): Promise<ActionResult>;

  /** Move. Paginates via `continuationToken` for large trees. */
  move(arg: {
    org: string;
    site: string;
    /** Source file path (leading-slash). */
    path: string;
    /** Destination file path (leading-slash). */
    destination: string;
    /** Conflict policy when destination exists. e.g. `'overwrite'`. */
    collision?: 'overwrite' | string;
    /** Pagination token from a previous `move` result. */
    continuationToken?: string;
  }): Promise<ActionResult>;
  /** `fullPath` is the source `/org/site/file/path` string. */
  move(
    fullPath: string,
    extras: {
      /** Destination file path (leading-slash). */
      destination: string;
      /** Conflict policy when destination exists. e.g. `'overwrite'`. */
      collision?: string;
      continuationToken?: string;
    },
  ): Promise<ActionResult>;

  createFolder(arg: { org: string; site: string; path: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/folder` string. */
  createFolder(fullPath: string): Promise<ApiResponse>;

  deleteFolder(arg: { org: string; site: string; path: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/folder` string. */
  deleteFolder(fullPath: string): Promise<ApiResponse>;
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
  /** GET preview status (single only). Default: parsed JSON; `undefined` when not ok. */
  getPreview(arg: { org: string; site: string; path: string; returnJson?: true }): Promise<AemJson | undefined>;
  getPreview(arg: { org: string; site: string; path: string; returnJson: false }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  getPreview(fullPath: string, extras?: { returnJson?: boolean }): Promise<AemJson | undefined | ApiResponse>;

  /** GET publish status (single only). Default: parsed JSON; `undefined` when not ok. */
  getPublish(arg: { org: string; site: string; path: string; returnJson?: true }): Promise<AemJson | undefined>;
  getPublish(arg: { org: string; site: string; path: string; returnJson: false }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  getPublish(fullPath: string, extras?: { returnJson?: boolean }): Promise<AemJson | undefined | ApiResponse>;

  /** Update preview. `path` array of 2+ → bulk (always `ApiResponse`). `forceUpdate`/`forceSync` are bulk-only. */
  preview(arg: {
    org: string;
    site: string;
    path: string;
    returnJson?: true;
    forceUpdate?: boolean;
    forceSync?: boolean;
  }): Promise<AemJson | undefined>;
  preview(arg: {
    org: string;
    site: string;
    path: string;
    returnJson: false;
    forceUpdate?: boolean;
    forceSync?: boolean;
  }): Promise<ApiResponse>;
  preview(arg: {
    org: string;
    site: string;
    path: string[];
    forceUpdate?: boolean;
    forceSync?: boolean;
  }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string (single only). */
  preview(
    fullPath: string,
    extras?: { returnJson?: boolean; forceUpdate?: boolean; forceSync?: boolean },
  ): Promise<AemJson | undefined | ApiResponse>;

  /** Remove from preview. Bulk (`path` array of 2+) always returns `ApiResponse`. */
  unPreview(arg: { org: string; site: string; path: string; returnJson?: true }): Promise<AemJson | undefined>;
  unPreview(arg: { org: string; site: string; path: string; returnJson: false }): Promise<ApiResponse>;
  unPreview(arg: { org: string; site: string; path: string[] }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string (single only). */
  unPreview(fullPath: string, extras?: { returnJson?: boolean }): Promise<AemJson | undefined | ApiResponse>;

  /** Publish. `path` array of 2+ → bulk (always `ApiResponse`). `forceUpdate`/`forceSync` are bulk-only. */
  publish(arg: {
    org: string;
    site: string;
    path: string;
    returnJson?: true;
    forceUpdate?: boolean;
    forceSync?: boolean;
  }): Promise<AemJson | undefined>;
  publish(arg: {
    org: string;
    site: string;
    path: string;
    returnJson: false;
    forceUpdate?: boolean;
    forceSync?: boolean;
  }): Promise<ApiResponse>;
  publish(arg: {
    org: string;
    site: string;
    path: string[];
    forceUpdate?: boolean;
    forceSync?: boolean;
  }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string (single only). */
  publish(
    fullPath: string,
    extras?: { returnJson?: boolean; forceUpdate?: boolean; forceSync?: boolean },
  ): Promise<AemJson | undefined | ApiResponse>;

  /** Unpublish. Bulk (`path` array of 2+) always returns `ApiResponse`. */
  unPublish(arg: { org: string; site: string; path: string; returnJson?: true }): Promise<AemJson | undefined>;
  unPublish(arg: { org: string; site: string; path: string; returnJson: false }): Promise<ApiResponse>;
  unPublish(arg: { org: string; site: string; path: string[] }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string (single only). */
  unPublish(fullPath: string, extras?: { returnJson?: boolean }): Promise<AemJson | undefined | ApiResponse>;
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

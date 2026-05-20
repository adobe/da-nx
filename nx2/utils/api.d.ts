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

// ─── low-level ──────────────────────────────────────────────────────────────

export function daFetch(args: {
  url: string;
  opts?: RequestInit;
  redirect?: boolean;
}): Promise<ApiResponse>;

export function isHlx6(org: string, site: string): Promise<boolean>;

export function signout(): void;

export function hlx6ToDaList(parentPath: string, items: any[]): any[];

/** Split `/org/site/file/path` into `{ org, site, path }`. */
export function fromPath(fullPath: string): { org: string; site: string; path: string };

// ─── source ─────────────────────────────────────────────────────────────────

export const source: {
  get(arg: { org: string; site: string; path?: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  get(fullPath: string): Promise<ApiResponse>;

  /**
   * List a folder. Pass `{ org }` (no site) to list sites at the org level —
   * this falls back to DA-legacy `/list/{org}` (no hlx6 equivalent).
   */
  list(arg: { org: string; site?: string; path?: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/folder` string (omit trailing file for root). */
  list(fullPath: string): Promise<ApiResponse>;

  put(arg: {
    org: string;
    site: string;
    path: string;
    /** File contents to upload. */
    body: BodyInit;
  }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  put(
    fullPath: string,
    extras: {
      /** File contents to upload. */
      body: BodyInit;
    },
  ): Promise<ApiResponse>;

  getMetadata(arg: { org: string; site: string; path: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  getMetadata(fullPath: string): Promise<ApiResponse>;

  delete(arg: { org: string; site: string; path: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  delete(fullPath: string): Promise<ApiResponse>;

  copy(arg: {
    org: string;
    site: string;
    /** Source file path (leading-slash). */
    path: string;
    /** Destination file path (leading-slash). */
    destination: string;
    /** Conflict policy when destination exists. e.g. `'overwrite'`. */
    collision?: 'overwrite' | string;
  }): Promise<ApiResponse>;
  /** `fullPath` is the source `/org/site/file/path` string. */
  copy(
    fullPath: string,
    extras: {
      /** Destination file path (leading-slash). */
      destination: string;
      /** Conflict policy when destination exists. e.g. `'overwrite'`. */
      collision?: string;
    },
  ): Promise<ApiResponse>;

  move(arg: {
    org: string;
    site: string;
    /** Source file path (leading-slash). */
    path: string;
    /** Destination file path (leading-slash). */
    destination: string;
    /** Conflict policy when destination exists. e.g. `'overwrite'`. */
    collision?: 'overwrite' | string;
  }): Promise<ApiResponse>;
  /** `fullPath` is the source `/org/site/file/path` string. */
  move(
    fullPath: string,
    extras: {
      /** Destination file path (leading-slash). */
      destination: string;
      /** Conflict policy when destination exists. e.g. `'overwrite'`. */
      collision?: string;
    },
  ): Promise<ApiResponse>;

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
  /** Single-path only. H6 has no bulk status endpoint. */
  get(arg: { org: string; site: string; path: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  get(fullPath: string): Promise<ApiResponse>;
};

// ─── aem (preview + live) ───────────────────────────────────────────────────

export const aem: {
  /** GET preview status (single only). */
  getPreview(arg: { org: string; site: string; path: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  getPreview(fullPath: string): Promise<ApiResponse>;

  /** GET publish status (single only). */
  getPublish(arg: { org: string; site: string; path: string }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string. */
  getPublish(fullPath: string): Promise<ApiResponse>;

  /** Update preview. `path` array of 2+ → bulk. `forceUpdate`/`forceSync` are bulk-only. */
  preview(arg: {
    org: string;
    site: string;
    path: string | string[];
    /** Bulk only: force update even if source is unchanged. */
    forceUpdate?: boolean;
    /** Bulk only: run synchronously and wait for the operation to complete. */
    forceSync?: boolean;
  }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string (single only). */
  preview(fullPath: string): Promise<ApiResponse>;

  /** Remove from preview. `path` array of 2+ → bulk with `{ delete: true }`. */
  unPreview(arg: { org: string; site: string; path: string | string[] }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string (single only). */
  unPreview(fullPath: string): Promise<ApiResponse>;

  /** Publish. `path` array of 2+ → bulk. `forceUpdate`/`forceSync` are bulk-only. */
  publish(arg: {
    org: string;
    site: string;
    path: string | string[];
    /** Bulk only: force update even if source is unchanged. */
    forceUpdate?: boolean;
    /** Bulk only: run synchronously and wait for the operation to complete. */
    forceSync?: boolean;
  }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string (single only). */
  publish(fullPath: string): Promise<ApiResponse>;

  /** Unpublish. `path` array of 2+ → bulk with `{ delete: true }`. */
  unPublish(arg: { org: string; site: string; path: string | string[] }): Promise<ApiResponse>;
  /** `fullPath` is a `/org/site/file/path` string (single only). */
  unPublish(fullPath: string): Promise<ApiResponse>;
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

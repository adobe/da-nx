import {
  normalizeOriginalPath,
  getDedupeKey,
  computeCanonicalModifiedTimestamp,
  createMedialogEntry,
  detectMediaType,
  computeCanonicalMetadata,
} from './parse.js';
import { normalizePath } from './parse-utils.js';
import { canonicalizeMediaUrl } from '../core/urls.js';

/**
 * Copies canonical display/timestamp metadata from source to target.
 */
function copyCanonicalMetadataFields(target, source) {
  if (!source) return;
  target.displayName = source.displayName;
  target.modifiedTimestamp = source.modifiedTimestamp;
}

/**
 * Builds a map of canonical modified timestamps from medialog entries.
 * Groups entries by hash and computes the canonical timestamp for each asset.
 */
export function buildCanonicalTimestampMap(medialogEntries) {
  const entriesByHash = new Map();
  medialogEntries.forEach((entry) => {
    const hash = entry.mediaHash;
    if (!hash) return;
    if (!entriesByHash.has(hash)) {
      entriesByHash.set(hash, []);
    }
    entriesByHash.get(hash).push(entry);
  });

  const canonicalTimestamps = new Map();
  entriesByHash.forEach((entries, hash) => {
    const timestamp = computeCanonicalModifiedTimestamp(entries);
    canonicalTimestamps.set(hash, timestamp);
  });

  return canonicalTimestamps;
}

/**
 * Groups medialog entries by page path and separates standalone uploads.
 * Returns a map of page paths to their media entries, and a buffer of standalone uploads.
 */
export function buildPageMediaFromMedialog(
  medialogEntries,
  org,
  repo,
  existingIndex = new Map(),
  canonicalTimestamps = new Map(),
) {
  const pageMediaMap = new Map();
  const standaloneBuffer = [];

  medialogEntries.forEach((media) => {
    if (media.originalFilename && !media.resourcePath) {
      standaloneBuffer.push(media);
      return;
    }
    if (!media.resourcePath) {
      return;
    }

    const normPath = normalizePath(media.resourcePath);

    let mediaFilePath;
    try {
      const url = new URL(media.path);
      mediaFilePath = normalizePath(url.pathname);
    } catch {
      mediaFilePath = normalizePath(media.path);
    }

    if (mediaFilePath === normPath) {
      standaloneBuffer.push(media);
      return;
    }

    const dedupeKey = getDedupeKey(canonicalizeMediaUrl(media.path, org, repo));
    const existingMetadata = existingIndex.get(dedupeKey);
    const hash = media.mediaHash || dedupeKey;
    const canonicalModifiedTimestamp = canonicalTimestamps.get(hash);

    const entry = createMedialogEntry(media, {
      doc: normPath,
      existingMeta: existingMetadata,
      org,
      repo,
      canonicalModifiedTimestamp,
    });

    const existing = pageMediaMap.get(normPath);
    if (!existing) {
      pageMediaMap.set(normPath, { timestamp: media.timestamp, entries: [entry] });
    } else {
      existing.entries.push(entry);
      // Update to latest timestamp for the page
      if (media.timestamp > existing.timestamp) {
        existing.timestamp = media.timestamp;
      }
    }
  });

  return { pageMediaMap, standaloneBuffer };
}

/**
 * Merges medialog chunk into a media map for progressive display.
 * Flattens the aggregated map into individual index entries.
 */
export function mergeMedialogChunkIntoMap(
  entries,
  mediaMap,
  org,
  repo,
  contentPath = '',
  existingByDedupeKey = null,
) {
  let pathPrefix = null;
  if (contentPath && String(contentPath).trim()) {
    pathPrefix = contentPath.endsWith('/') ? contentPath : `${contentPath}/`;
  }
  const isUnderPath = (path) => (
    !pathPrefix || !path || path === contentPath || path.startsWith(pathPrefix)
  );

  entries.forEach((media) => {
    if (!media?.path) return;
    if (media.resourcePath && !isUnderPath(normalizePath(media.resourcePath))) return;

    const key = getDedupeKey(media.path);
    const doc = media.resourcePath ? normalizePath(media.resourcePath) : '';

    // Initialize entry if it doesn't exist
    if (!mediaMap.has(key)) {
      mediaMap.set(key, {
        hash: media.mediaHash || key,
        url: canonicalizeMediaUrl(media.path, org, repo),
        originalPath: normalizeOriginalPath(media.originalFilename),
        timestamp: media.timestamp ?? 0,
        user: media.user ?? '',
        operation: media.operation ?? '',
        type: detectMediaType(media),
        uniqueSources: new Set(),
        lastMedialog: media,
      });
    }

    const existing = mediaMap.get(key);

    // Collect all unique page references
    if (doc) {
      existing.uniqueSources.add(doc);
    }

    // Update timestamp, user, operation if this entry is newer
    if (media.timestamp > existing.timestamp) {
      existing.timestamp = media.timestamp;
      existing.user = media.user ?? existing.user;
      existing.operation = media.operation ?? existing.operation;
    }
    if (media.originalFilename) {
      existing.originalPath = normalizeOriginalPath(media.originalFilename);
    }
    existing.lastMedialog = media;
  });

  // Canonical metadata on aggregates (progressive UI reads mediaMap values;
  // flatten reuses the same fields)
  mediaMap.forEach((media) => {
    const existingMeta = existingByDedupeKey?.get(getDedupeKey(media.url)) || null;
    const ml = media.lastMedialog || {
      path: media.url,
      timestamp: media.timestamp,
      operation: media.operation,
      user: media.user,
    };
    const canonical = computeCanonicalMetadata(ml, existingMeta);
    copyCanonicalMetadataFields(media, canonical);
  });

  // Flatten: expand each media with uniqueSources into multiple rows (one per page)
  const flattened = [];
  mediaMap.forEach((media) => {
    if (media.uniqueSources.size > 0) {
      media.uniqueSources.forEach((doc) => {
        const row = {
          hash: media.hash,
          url: media.url,
          originalPath: media.originalPath || '',
          timestamp: media.timestamp,
          user: media.user,
          operation: media.operation,
          type: media.type,
          doc,
        };
        copyCanonicalMetadataFields(row, media);
        flattened.push(row);
      });
    } else {
      const row = {
        hash: media.hash,
        url: media.url,
        originalPath: media.originalPath || '',
        timestamp: media.timestamp,
        user: media.user,
        operation: media.operation,
        type: media.type,
        doc: '',
      };
      copyCanonicalMetadataFields(row, media);
      flattened.push(row);
    }
  });

  return flattened;
}

/**
 * Converts page media map to entry map for index building.
 * Returns entry map keyed by "dedupeKey|doc" and set of referenced hashes.
 */
export function pageMediaToEntryMap(pageMediaMap) {
  const entryMap = new Map();
  const referencedHashes = new Set();

  pageMediaMap.forEach(({ entries }, doc) => {
    entries.forEach((e) => {
      // Use dedupe key from URL, not mediaHash, to avoid collisions
      const mediaKey = getDedupeKey(e.url);
      const key = `${mediaKey}|${doc}`;
      const existing = entryMap.get(key);
      if (!existing || e.timestamp > existing.timestamp) {
        entryMap.set(key, {
          hash: e.hash,
          url: e.url,
          originalPath: e.originalPath || '',
          timestamp: e.timestamp,
          user: e.user,
          operation: e.operation,
          type: e.type,
          doc,
          displayName: e.displayName,
          modifiedTimestamp: e.modifiedTimestamp,
        });
        referencedHashes.add(e.hash);
      }
    });
  });

  return { entryMap, referencedHashes };
}

/**
 * Removes page-media entry from index, orphaning to unused if no other references exist.
 * Returns 1 if an entry was removed, 0 otherwise.
 */
export function removeOrOrphanMedia(idx, entry, path, medialog) {
  const i = idx.findIndex((e) => e.hash === entry.hash && e.doc === path);
  if (i === -1) return 0;
  const { hash } = entry;
  const hasUnlink = medialog.some((m) => m.mediaHash === hash && (m.operation === 'unlink' || m.operation === 'delete'));
  idx.splice(i, 1);
  const stillHasEntry = idx.some((e) => e.hash === hash);
  const alreadyOrphan = idx.some((e) => e.hash === hash && !e.doc);
  if (!stillHasEntry && !hasUnlink && !alreadyOrphan) {
    const orphan = {
      hash,
      url: entry.url,
      originalPath: entry.originalPath || '',
      timestamp: entry.timestamp,
      user: entry.user,
      operation: entry.operation,
      type: entry.type,
      doc: '',
    };
    copyCanonicalMetadataFields(orphan, entry);
    idx.push(orphan);
  }
  return 1;
}

/**
 * Merges page-based medialog into index for incremental builds.
 * Adds/removes entries per page based on diff between old and new medialog.
 */
export function processPageMediaUpdates(
  updatedIndex,
  pagesByPath,
  medialogEntries,
  usageMap,
  onLog,
  org,
  repo,
  existingIndex = new Map(),
  canonicalTimestamps = new Map(),
) {
  const { pageMediaMap } = buildPageMediaFromMedialog(
    medialogEntries,
    org,
    repo,
    existingIndex,
    canonicalTimestamps,
  );
  const allPages = new Set([...pagesByPath.keys(), ...pageMediaMap.keys()]);
  let added = 0;
  let removed = 0;

  allPages.forEach((normalizedPath) => {
    const oldHashes = usageMap.get(normalizedPath) || new Set();
    const pageData = pageMediaMap.get(normalizedPath);
    const newEntries = pageData ? pageData.entries : [];

    onLog(`--- Page: ${normalizedPath} ---`);
    onLog(`  Old (bypage): ${oldHashes.size}, New (page-based): ${newEntries.length}`);

    const newHashes = new Set(newEntries.map((e) => e.hash));
    const toRemove = [...oldHashes].filter((h) => !newHashes.has(h));
    const toAdd = [...newHashes].filter((h) => !oldHashes.has(h));

    if (toRemove.length || toAdd.length) {
      onLog(`  Diff: remove ${toRemove.length}, add ${toAdd.length}`);
    }

    toRemove.forEach((hash) => {
      const oldEntry = updatedIndex.find((e) => e.hash === hash && e.doc === normalizedPath);
      if (oldEntry) {
        removed += removeOrOrphanMedia(
          updatedIndex,
          oldEntry,
          normalizedPath,
          medialogEntries,
        );
      }
    });

    toAdd.forEach((hash) => {
      const entry = newEntries.find((e) => e.hash === hash);
      if (entry) {
        const row = {
          hash: entry.hash,
          url: entry.url,
          originalPath: entry.originalPath || '',
          timestamp: entry.timestamp,
          user: entry.user,
          operation: entry.operation,
          type: entry.type,
          doc: normalizedPath,
        };
        copyCanonicalMetadataFields(row, entry);
        updatedIndex.push(row);
        added += 1;
      }
    });

    newEntries.forEach((e) => {
      const idx = updatedIndex.findIndex((x) => x.hash === e.hash && x.doc === normalizedPath);
      if (idx !== -1) {
        updatedIndex[idx].timestamp = e.timestamp;
        copyCanonicalMetadataFields(updatedIndex[idx], e);
      }
    });
  });

  return { added, removed };
}

/**
 * Processes standalone uploads (media not linked to any page) from medialog.
 * Adds unused rows for uploads that aren't already referenced.
 */
export function processStandaloneUploads(
  updatedIndex,
  medialogEntries,
  referencedHashes,
  org,
  repo,
) {
  let added = 0;
  const standaloneUploads = medialogEntries.filter((m) => !m.resourcePath && m.originalFilename);

  standaloneUploads.forEach((media) => {
    if (!referencedHashes.has(media.mediaHash)) {
      const exists = updatedIndex.some((e) => e.hash === media.mediaHash && !e.doc);
      if (!exists) {
        const url = canonicalizeMediaUrl(media.path, org, repo);
        const dedupeKey = getDedupeKey(url);
        const existing = updatedIndex.find(
          (e) => e.url && getDedupeKey(e.url) === dedupeKey,
        ) || null;
        const canonical = computeCanonicalMetadata(media, existing);
        const row = {
          hash: media.mediaHash,
          url,
          originalPath: normalizeOriginalPath(media.originalFilename),
          timestamp: media.timestamp,
          user: media.user,
          operation: media.operation,
          type: detectMediaType(media),
          doc: '',
        };
        copyCanonicalMetadataFields(row, canonical);
        updatedIndex.push(row);
        added += 1;
      }
    }
  });

  return added;
}

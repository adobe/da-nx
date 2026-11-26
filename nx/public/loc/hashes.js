import './object_hash.js';

export const HASH_LENGTH = 12;
export const ACCEPTED_KEY = 'acceptedHashes';
export const REJECTED_KEY = 'rejectedHashes';
export const ROLLOUT_BASE_KEY = 'rolloutbase';
export const ROLLOUT_ORDER_KEY = 'rolloutorder';
export const REVIEW_KEYS = [ACCEPTED_KEY, REJECTED_KEY];

export function readReviewHashes(metadata, key) {
  const lowerKey = key.toLowerCase();
  const hashes = [...metadata?.children || []]
    .filter((row) => row.children[0]?.textContent.trim().toLowerCase() === lowerKey)
    .flatMap((row) => (row.children[1]?.textContent || '').trim().toLowerCase().split(','))
    .map((hash) => hash.trim())
    .filter((hash) => /^[0-9a-f]{12}$/.test(hash));
  return [...new Set(hashes)];
}

export function restoreReviewKeys(metadata, element) {
  REVIEW_KEYS.forEach((key) => {
    delete metadata[key.toLowerCase()];
    const hashes = readReviewHashes(element, key);
    if (hashes.length) metadata[key] = hashes.join(',');
  });
  return metadata;
}

export const hashContent = (content) => globalThis.objectHash(content);
export const getDiffHash = (content) => hashContent(content).substring(0, HASH_LENGTH);

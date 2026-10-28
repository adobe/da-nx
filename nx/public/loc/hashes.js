import './object_hash.js';

export const HASH_LENGTH = 12;
export const ACCEPTED_KEY = 'acceptedHashes';
export const REJECTED_KEY = 'rejectedHashes';

export const hashContent = (content) => globalThis.objectHash(content);
export const getDiffHash = (content) => hashContent(content).substring(0, HASH_LENGTH);

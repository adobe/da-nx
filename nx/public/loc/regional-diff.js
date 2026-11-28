import { engine } from './da-merge.js';

export { LOC_MARKERS, isSnapshotPath, removeLocTags } from './da-merge.js';

export const normalizeLinks = (...args) => engine.normalizeLinks(...args);
export const removeRejectedBlocks = (...args) => engine.removeRejectedBlocks(...args);
export const getBlockHashes = (...args) => engine.getBlockHashes(...args);
export const getContentHashes = (...args) => engine.getContentHashes(...args);
export const smartMerge = (...args) => engine.smartMerge(...args);
export const regionalDiff = (...args) => engine.regionalDiff(...args);

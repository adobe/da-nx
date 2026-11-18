import { parseSelections, writeSelections } from './imageSelections.js';

export const LOC_VIDEOS_KEY = 'loc-videos';

export function parseVideoSelections(htmlOrDoc) {
  return parseSelections(htmlOrDoc, { metadataKey: LOC_VIDEOS_KEY });
}

export function writeVideoSelections(htmlOrDoc, rows) {
  return writeSelections(htmlOrDoc, rows, { metadataKey: LOC_VIDEOS_KEY });
}

import { getMediaType, isSvgFile, isUiExcludedMediaItem } from '../core/media.js';
import { getBasePath, formatDocPath } from '../core/paths.js';
import { pluralize } from '../core/utils.js';
import { getDedupeKey, isInternalToSite } from '../core/urls.js';
import {
  clearProcessDataCache as clearCache,
  getCachedProcessData,
  setCachedProcessData,
  generateCacheKey,
} from '../indexing/cache.js';
import { getMediaCardLabel } from './templates.js';

function normalizeFolderPath(path) {
  return !path || path === '/' ? '/' : path.replace(/\/$/, '');
}

function resolveSearchPath(value, basePath) {
  let searchPath = value.startsWith('/') ? value : `/${value}`;
  if (basePath && !searchPath.startsWith(basePath)) {
    searchPath = searchPath === '/' ? basePath : `${basePath}${searchPath}`;
  }
  return searchPath;
}

function countPathDepth(path) {
  return (path.match(/\//g) || []).length;
}

function sortPaths(paths) {
  return [...paths].sort((a, b) => {
    const depthDiff = countPathDepth(a) - countPathDepth(b);
    if (depthDiff !== 0) {
      return depthDiff;
    }
    return a.localeCompare(b);
  });
}

function isRootDocPath(docPath) {
  if (!docPath) return false;
  const cleanPath = docPath.replace(/\.html$/, '');
  return !cleanPath.includes('/', 1);
}

function getFolderPathFromDoc(docPath) {
  if (!docPath || isRootDocPath(docPath)) {
    return '';
  }

  const cleanPath = docPath.replace(/\.html$/, '');
  const lastSlash = cleanPath.lastIndexOf('/');
  return lastSlash > 0 ? cleanPath.substring(0, lastSlash) : '';
}

function getUsageInfo(processedData, item) {
  if (!processedData || !item?.url) return null;
  return processedData.usageData[getDedupeKey(item.url)] || null;
}

function findMatchingDocForFolder(usageInfo, searchPath) {
  if (!usageInfo?.docs?.length) {
    return null;
  }

  if (searchPath === '/') {
    return usageInfo.docs.find((doc) => isRootDocPath(doc)) || usageInfo.firstDoc;
  }

  return usageInfo.docs.find((doc) => {
    const folderPath = getFolderPathFromDoc(doc);
    return folderPath && folderPath.startsWith(searchPath);
  }) || usageInfo.firstDoc;
}

function withRepresentativeDoc(item, doc) {
  if (!doc || item.doc === doc) {
    return item;
  }

  return {
    ...item,
    doc,
  };
}

/** Sidebar type filters (except No References) show only indexed referenced rows. */
const isReferenced = (item) => item.status !== 'unused';

/** Search suggestions: same referenced vs unused rules as the sidebar filters. */
function applyReferenceFilterForSuggestions(item, selectedFilterType) {
  if (selectedFilterType === 'noReferences') {
    return item.status === 'unused';
  }
  return item.status !== 'unused';
}

export const FILTER_CONFIG = {
  all: (item) => isReferenced(item) && !isSvgFile(item),
  documents: (item) => isReferenced(item) && getMediaType(item) === 'document',
  fragments: (item) => isReferenced(item) && getMediaType(item) === 'fragment',
  images: (item) => isReferenced(item) && getMediaType(item) === 'image' && !isSvgFile(item),
  icons: (item) => isReferenced(item) && isSvgFile(item),
  links: (item, org, repo) => isReferenced(item) && !isInternalToSite(item.url, org, repo),
  noReferences: (item) => item.status === 'unused',
  videos: (item) => isReferenced(item) && getMediaType(item) === 'video',

  documentImages: (item, selectedDocument) => FILTER_CONFIG.images(item)
  && item.doc === selectedDocument,
  documentIcons: (item, selectedDocument) => FILTER_CONFIG.icons(item)
  && item.doc === selectedDocument,
  documentVideos: (item, selectedDocument) => FILTER_CONFIG.videos(item)
   && item.doc === selectedDocument,
  documentDocuments: (item, selectedDocument) => FILTER_CONFIG.documents(item)
   && item.doc === selectedDocument,
  documentFragments: (item, selectedDocument) => FILTER_CONFIG.fragments(item)
   && item.doc === selectedDocument,
  documentLinks: (item, selectedDocument, org, repo) => FILTER_CONFIG.links(item, org, repo)
   && item.doc === selectedDocument,

  documentTotal: (item, selectedDocument) => item.doc === selectedDocument,
};

// Applies type filter (all, documents, images, etc.) to data.
export function applyFilter(data, filterName, selectedDocument, org, repo) {
  const filterFn = FILTER_CONFIG[filterName];

  if (filterFn) {
    if (filterName.startsWith('document')) {
      return data.filter((item) => filterFn(item, selectedDocument, org, repo));
    }
    if (filterName === 'links') {
      return data.filter((item) => filterFn(item, org, repo));
    }
    return data.filter(filterFn);
  }

  return data;
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Returns empty processed data structure for pipeline.
export function initializeProcessedData() {
  return {
    usageData: {},
    docPaths: [],
    folderPaths: [],
  };
}

// Clears cache; call after index builds.
export function clearProcessDataCache() {
  clearCache();
}

// Builds the lean derived data needed by the current UI.
export async function processMediaData(mediaData, onProgress = null) {
  if (!mediaData || mediaData.length === 0) {
    return initializeProcessedData();
  }

  const cacheKey = generateCacheKey(mediaData);
  const cached = getCachedProcessData(cacheKey);

  if (cached) {
    if (onProgress) onProgress(100);
    return cached;
  }

  const processedData = initializeProcessedData();
  const uniqueDocPaths = new Set();
  const uniqueFolderPaths = new Set();

  let batchSize = 1000;
  if (mediaData.length > 100000) {
    batchSize = 500;
  } else if (mediaData.length > 10000) {
    batchSize = 250;
  } else if (mediaData.length > 1000) {
    batchSize = 200;
  }

  const batches = chunkArray(mediaData, batchSize);
  const totalBatches = batches.length;

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];

    batch.forEach((item) => {
      if (!item.url) {
        return;
      }

      const groupingKey = getDedupeKey(item.url);
      if (!processedData.usageData[groupingKey]) {
        processedData.usageData[groupingKey] = {
          uniqueDocs: new Set(),
          uniqueFolders: new Set(),
          firstDoc: null,
          hasRootDoc: false,
          count: 0,
        };
      }

      if (!item.doc) {
        return;
      }

      const usage = processedData.usageData[groupingKey];
      if (usage.uniqueDocs.has(item.doc)) {
        return;
      }

      usage.uniqueDocs.add(item.doc);
      usage.count = usage.uniqueDocs.size;
      if (!usage.firstDoc) {
        usage.firstDoc = item.doc;
      }

      uniqueDocPaths.add(item.doc);

      if (isRootDocPath(item.doc)) {
        usage.hasRootDoc = true;
        return;
      }

      const folderPath = getFolderPathFromDoc(item.doc);
      if (folderPath) {
        usage.uniqueFolders.add(folderPath);
        uniqueFolderPaths.add(folderPath);
      }
    });

    if (onProgress) {
      onProgress(((i + 1) / totalBatches) * 100);
    }

    if (i < batches.length - 1) {
      if (mediaData.length > 100000 && i % 5 === 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1);
        });
      } else if (mediaData.length > 10000 && i % 3 === 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1);
        });
      } else {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      }
    }
  }

  Object.values(processedData.usageData).forEach((usage) => {
    usage.docs = Array.from(usage.uniqueDocs);
    usage.folders = Array.from(usage.uniqueFolders);
    delete usage.uniqueDocs;
    delete usage.uniqueFolders;
  });

  processedData.docPaths = sortPaths(Array.from(uniqueDocPaths));
  processedData.folderPaths = sortPaths(Array.from(uniqueFolderPaths));

  setCachedProcessData(cacheKey, processedData);

  return processedData;
}

export function parseColonSyntax(query) {
  if (!query) return null;

  const colonMatch = query.match(/^(doc|name|url|user|folder):(.*)$/i);
  if (colonMatch) {
    const [, field, value] = colonMatch;
    return {
      field: field.toLowerCase(),
      value: value.trim().toLowerCase(),
      originalQuery: query,
    };
  }

  return null;
}

function filterByColonSyntax(mediaData, colonSyntax, processedData) {
  const { field, value } = colonSyntax;
  const normalizedValue = normalizeFolderPath(value);
  const searchPath = resolveSearchPath(
    field === 'folder' ? normalizedValue : value,
    getBasePath(),
  ).toLowerCase();

  return mediaData.reduce((filteredResults, item) => {
    const usageInfo = getUsageInfo(processedData, item);

    switch (field) {
      case 'doc': {
        const matchedDoc = usageInfo?.docs?.find((doc) => doc.toLowerCase().includes(searchPath))
          || (item.doc?.toLowerCase().includes(searchPath) ? item.doc : null);
        if (matchedDoc) {
          filteredResults.push(withRepresentativeDoc(item, matchedDoc));
        }
        break;
      }
      case 'name':
        if ((item.displayName || item.name)
          && (item.displayName || item.name).toLowerCase().includes(value)) {
          filteredResults.push(item);
        }
        break;
      case 'url':
        if (item.url && item.url.toLowerCase().includes(value)) {
          filteredResults.push(item);
        }
        break;
      case 'user':
        if (item.user && item.user.toLowerCase().includes(value)) {
          filteredResults.push(item);
        }
        break;
      case 'folder': {
        let matchedDoc = null;

        if (normalizedValue === '' || normalizedValue === '/') {
          if (usageInfo?.hasRootDoc) {
            matchedDoc = findMatchingDocForFolder(usageInfo, '/');
          } else if (item.doc && isRootDocPath(item.doc)) {
            matchedDoc = item.doc;
          }
        } else if (
          usageInfo?.folders?.some((folderPath) => folderPath.toLowerCase().startsWith(searchPath))
        ) {
          matchedDoc = findMatchingDocForFolder(usageInfo, searchPath);
        } else if (item.doc) {
          const folderPath = getFolderPathFromDoc(item.doc);
          if (folderPath && folderPath.toLowerCase().startsWith(searchPath)) {
            matchedDoc = item.doc;
          }
        }

        if (matchedDoc) {
          filteredResults.push(withRepresentativeDoc(item, matchedDoc));
        }
        break;
      }
      default:
        break;
    }
    return filteredResults;
  }, []);
}

/** Collapses whitespace for contiguous phrase matching. */
function normalizeSearchPhrase(queryLower) {
  return queryLower.trim().replace(/\s+/g, ' ');
}

/** Plain-text query tokens (whitespace-separated). */
function tokenizeSearchQuery(queryLower) {
  return normalizeSearchPhrase(queryLower).split(' ').filter(Boolean);
}

/**
 * Plain-text match: tier (primary rank) + weighted score (secondary).
 *
 * Tier (descending priority): 2 = contiguous full phrase in name/url/doc; 1 = all query tokens
 * match somewhere, but not the full phrase; 0 = only some tokens match. -1 = no match.
 *
 * Score (within tier): phrase in name +200, url +100, doc +35; per token in name +50,
 * url +20, doc +10.
 */
function computePlainTextSearchMatch(item, queryLower, processedData) {
  const phrase = normalizeSearchPhrase(queryLower);
  const tokens = tokenizeSearchQuery(queryLower);
  if (tokens.length === 0) {
    return { tier: -1, score: 0, matchedTokenCount: 0 };
  }

  const nameStr = (item.displayName || item.name || '').toLowerCase();
  const urlStr = (item.url || '').toLowerCase();
  const usageInfo = getUsageInfo(processedData, item);

  const textMatchesPhrase = (haystack, p) => haystack && p && haystack.includes(p);
  const docMatchesPhrase = (p) => {
    if (!p) return false;
    if (usageInfo?.docs?.some((doc) => doc.toLowerCase().includes(p))) return true;
    return !!(item.doc && item.doc.toLowerCase().includes(p));
  };

  let score = 0;

  if (phrase.length > 0) {
    if (textMatchesPhrase(nameStr, phrase)) score += 200;
    if (textMatchesPhrase(urlStr, phrase)) score += 100;
    if (docMatchesPhrase(phrase)) score += 35;
  }

  tokens.forEach((token) => {
    if (textMatchesPhrase(nameStr, token)) score += 50;
    if (textMatchesPhrase(urlStr, token)) score += 20;
    if (docMatchesPhrase(token)) score += 10;
  });

  let matchedTokenCount = 0;
  tokens.forEach((token) => {
    const inName = textMatchesPhrase(nameStr, token);
    const inUrl = textMatchesPhrase(urlStr, token);
    if (inName || inUrl || docMatchesPhrase(token)) {
      matchedTokenCount += 1;
    }
  });

  if (matchedTokenCount === 0) {
    return { tier: -1, score: 0, matchedTokenCount: 0 };
  }

  const hasPhraseAnywhere = phrase.length > 0 && (
    textMatchesPhrase(nameStr, phrase)
    || textMatchesPhrase(urlStr, phrase)
    || docMatchesPhrase(phrase)
  );

  let tier;
  if (hasPhraseAnywhere) {
    tier = 2;
  } else if (matchedTokenCount === tokens.length) {
    tier = 1;
  } else {
    tier = 0;
  }

  return { tier, score, matchedTokenCount };
}

/** Plain-text default search: displayName, name, url, and document paths from usage context. */
function itemMatchesPlainTextMediaQuery(item, queryLower, processedData) {
  return computePlainTextSearchMatch(item, queryLower, processedData).tier >= 0;
}

function filterByGeneralSearch(mediaData, query, processedData) {
  const results = [];

  for (let i = 0; i < mediaData.length; i += 1) {
    const item = mediaData[i];
    const { tier, score } = computePlainTextSearchMatch(item, query, processedData);

    if (tier >= 0) {
      results.push({ item, tier, score });
    }
  }

  results.sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;
    if (b.score !== a.score) return b.score - a.score;
    const nameA = (a.item.displayName || a.item.name || '').toLowerCase();
    const nameB = (b.item.displayName || b.item.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return results.map((r) => r.item);
}

// Default plain-text search matches displayName, name, url, and usage doc paths.
// Colon syntax provides explicit field filtering (doc:, folder:, name:, …).
export function filterBySearch(mediaData, searchQuery, processedData = null) {
  if (!searchQuery || !searchQuery.trim() || !mediaData) {
    return mediaData;
  }

  const query = searchQuery.toLowerCase().trim();
  const colonSyntax = parseColonSyntax(query);

  if (colonSyntax) {
    return filterByColonSyntax(mediaData, colonSyntax, processedData);
  }

  return filterByGeneralSearch(mediaData, query, processedData);
}

function getFolderSuggestions(processedData, value) {
  const basePath = getBasePath();
  const folderPaths = processedData?.folderPaths || [];

  if (folderPaths.length === 0) {
    return [];
  }

  const searchPath = resolveSearchPath(value, basePath);

  const filteredPaths = folderPaths.filter((folderPath) => {
    if (value === '' || value === '/') {
      return true;
    }

    if (searchPath.endsWith('/')) {
      return folderPath.startsWith(searchPath) && folderPath !== searchPath.slice(0, -1);
    }

    return folderPath.startsWith(searchPath);
  });

  const folderSuggestions = filteredPaths
    .map((folderPath) => {
      let displayPath = folderPath;
      if (basePath && folderPath.startsWith(basePath)) {
        displayPath = folderPath.substring(basePath.length) || '/';
        if (displayPath && !displayPath.startsWith('/')) {
          displayPath = `/${displayPath}`;
        }
      }
      return {
        type: 'folder',
        value: displayPath,
        display: displayPath,
        absolutePath: folderPath,
      };
    })
    .filter((suggestion) => {
      if (basePath && suggestion.value === '/') {
        return false;
      }
      return true;
    });

  return folderSuggestions;
}

function getDocSuggestions(processedData, value) {
  const basePath = getBasePath();
  const docPaths = processedData?.docPaths || [];

  if (docPaths.length === 0) {
    return [];
  }

  const searchPath = resolveSearchPath(value, basePath);
  const matchingDocs = docPaths.filter((doc) => {
    if (value === '' || value === '/') {
      return true;
    }

    if (searchPath.endsWith('/')) {
      return getFolderPathFromDoc(doc) === searchPath.slice(0, -1);
    }

    return doc.replace(/\.html$/, '').startsWith(searchPath);
  });

  return matchingDocs.map((doc) => {
    const normalizedDoc = formatDocPath(doc);
    let displayPath = normalizedDoc;
    if (basePath && normalizedDoc.startsWith(basePath)) {
      displayPath = normalizedDoc.substring(basePath.length) || '/';
      if (displayPath && !displayPath.startsWith('/')) {
        displayPath = `/${displayPath}`;
      }
    }
    return {
      type: 'doc',
      value: displayPath,
      display: displayPath,
      absolutePath: doc,
    };
  });
}

export function getSearchSuggestions(
  mediaData,
  query,
  createSuggestionFn,
  processedData = null,
  selectedFilterType = null,
  org = null,
  repo = null,
) {
  if (!query || !query.trim() || !mediaData) {
    return [];
  }

  const q = query.toLowerCase().trim();
  const colonSyntax = parseColonSyntax(query);
  const scopedMedia = mediaData.filter((item) => !isUiExcludedMediaItem(item));

  if (colonSyntax) {
    const { field, value } = colonSyntax;

    if (field === 'folder') {
      return getFolderSuggestions(processedData, value).slice(0, 10);
    }

    if (field === 'doc') {
      return getDocSuggestions(processedData, value).slice(0, 10);
    }

    const suggestions = [];

    scopedMedia.forEach((item) => {
      // Check field match first
      let fieldMatch = false;
      switch (field) {
        case 'name':
          fieldMatch = (item.displayName || item.name)
            && (item.displayName || item.name).toLowerCase().includes(value);
          break;
        case 'url':
          fieldMatch = item.url && item.url.toLowerCase().includes(value);
          break;
        case 'user':
          fieldMatch = item.user && item.user.toLowerCase().includes(value);
          break;
        default:
          return;
      }

      if (!fieldMatch) return;

      if (!applyReferenceFilterForSuggestions(item, selectedFilterType)) return;

      if (selectedFilterType && selectedFilterType !== 'all' && selectedFilterType !== 'noReferences') {
        const isSvg = isSvgFile(item);
        const itemType = getMediaType(item);

        if (selectedFilterType === 'icons') {
          if (!isSvg) return;
        } else if (selectedFilterType === 'images') {
          if (isSvg || itemType !== 'image') return;
        } else if (selectedFilterType === 'links') {
          if (isInternalToSite(item.url, org, repo)) return;
        } else {
          const filterToMediaType = {
            videos: 'video',
            documents: 'document',
            fragments: 'fragment',
          };
          const expectedType = filterToMediaType[selectedFilterType];
          if (expectedType && itemType !== expectedType) return;
        }
      } else if ((!selectedFilterType || selectedFilterType === 'all') && isSvgFile(item)) {
        return;
      }

      const suggestion = createSuggestionFn(item, processedData, query);
      if (suggestion) {
        const { tier, score } = computePlainTextSearchMatch(
          item,
          value.toLowerCase(),
          processedData,
        );
        suggestions.push({ suggestion, tier, score });
      }
    });

    suggestions.sort((a, b) => {
      if (b.tier !== a.tier) return b.tier - a.tier;
      if (b.score !== a.score) return b.score - a.score;
      const nameA = (a.suggestion?.display || '').toString().toLowerCase();
      const nameB = (b.suggestion?.display || '').toString().toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return suggestions.map((s) => s.suggestion).slice(0, 10);
  }

  if (q.startsWith('/')) {
    const folderSuggestions = getFolderSuggestions(processedData, q);
    const docSuggestions = getDocSuggestions(processedData, q);

    const combined = [...folderSuggestions, ...docSuggestions];

    combined.sort((a, b) => {
      const depthA = (a.display.match(/\//g) || []).length;
      const depthB = (b.display.match(/\//g) || []).length;
      if (depthA !== depthB) {
        return depthA - depthB;
      }
      return a.display.localeCompare(b.display);
    });

    return combined.slice(0, 10);
  }

  // Filter-aware suggestions: only show media names matching the active filter
  // Don't show docs/folders unless user uses special syntax (doc:, folder:, /)
  const suggestions = [];

  scopedMedia.forEach((item) => {
    if (!itemMatchesPlainTextMediaQuery(item, q, processedData)) {
      return;
    }

    if (!applyReferenceFilterForSuggestions(item, selectedFilterType)) return;

    // Apply filter-specific logic
    if (selectedFilterType && selectedFilterType !== 'all' && selectedFilterType !== 'noReferences') {
      const isSvg = isSvgFile(item);
      const itemType = getMediaType(item);

      if (selectedFilterType === 'icons') {
        if (!isSvg) return;
      } else if (selectedFilterType === 'images') {
        if (isSvg || itemType !== 'image') return;
      } else if (selectedFilterType === 'links') {
        if (isInternalToSite(item.url, org, repo)) return;
      } else {
        const filterToMediaType = {
          videos: 'video',
          documents: 'document',
          fragments: 'fragment',
        };
        const expectedType = filterToMediaType[selectedFilterType];
        if (expectedType && itemType !== expectedType) {
          return;
        }
      }
    } else if ((!selectedFilterType || selectedFilterType === 'all') && isSvgFile(item)) {
      return;
    }

    const suggestion = createSuggestionFn(item, processedData, q);
    if (suggestion) {
      const { tier, score } = computePlainTextSearchMatch(item, q, processedData);
      suggestions.push({ suggestion, tier, score });
    }
  });

  suggestions.sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;
    if (b.score !== a.score) return b.score - a.score;
    const nameA = (a.suggestion?.display || '').toString().toLowerCase();
    const nameB = (b.suggestion?.display || '').toString().toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return suggestions.map((s) => s.suggestion).slice(0, 10);
}

function enrichWithUsageData(item, processedData, doc = null) {
  const usageInfo = getUsageInfo(processedData, item);
  const usageCount = usageInfo?.count ?? item.usageCount ?? 0;
  const mediaWithUsage = usageCount === item.usageCount
    ? item
    : {
      ...item,
      usageCount,
    };

  return withRepresentativeDoc(mediaWithUsage, doc);
}

export function enrichMediaItemsWithUsage(mediaData, processedData) {
  if (!mediaData || mediaData.length === 0) {
    return [];
  }

  return mediaData.map((item) => enrichWithUsageData(item, processedData));
}

/**
 * Finds match indices in text for highlighting.
 * Returns array of {start, end} or null if no match.
 */
function findMatchIndices(text, query) {
  if (!text || !query) return null;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return null;
  return [{ start: index, end: index + query.length }];
}

/**
 * Creates search suggestion with highlighting and match context.
 * Match context helps UI show WHERE the match occurred (name, url, or doc path).
 */
export function createSearchSuggestion(item, processedData = null, query = '') {
  if (!item.displayName && !item.name && !item.url && !item.doc) return null;

  const firstDoc = getUsageInfo(processedData, item)?.firstDoc || item.doc || null;

  let displayName = getMediaCardLabel(item);
  if (!displayName || displayName === 'Unknown') {
    displayName = item.displayName || item.name || item.url || 'Unnamed Media';
  }
  if (displayName && displayName !== 'Unnamed Media') {
    const rawDisplayName = displayName;
    try {
      displayName = decodeURIComponent(displayName);
    } catch {
      displayName = rawDisplayName;
    }
  }

  const matchContext = {
    field: null,
    highlights: null,
    matchedDoc: null,
  };

  if (query) {
    const queryLower = query.toLowerCase();

    if (displayName.toLowerCase().includes(queryLower)) {
      matchContext.field = 'name';
      matchContext.highlights = findMatchIndices(displayName, query);
    } else if (item.url && item.url.toLowerCase().includes(queryLower)) {
      matchContext.field = 'url';
      matchContext.highlights = findMatchIndices(item.url, query);
    } else {
      const usageInfo = getUsageInfo(processedData, item);
      const matchedDoc = usageInfo?.docs?.find((doc) => doc.toLowerCase().includes(queryLower));
      if (matchedDoc) {
        matchContext.field = 'doc';
        matchContext.matchedDoc = matchedDoc;
        matchContext.highlights = findMatchIndices(matchedDoc, query);
      }
    }
  }

  return {
    type: 'media',
    value: item,
    display: displayName,
    matchContext,
    details: {
      doc: firstDoc ? formatDocPath(firstDoc) : null,
      url: item.url,
      type: getMediaType(item),
    },
  };
}

// Returns media for the selected doc with a representative doc on the item.
export function filterByDocument(
  mediaData,
  selectedDocument,
  processedData,
) {
  if (!selectedDocument || !mediaData) {
    return [];
  }

  return mediaData.reduce((documentItems, item) => {
    const usageInfo = getUsageInfo(processedData, item);
    const hasSelectedDoc = usageInfo?.docs?.includes(selectedDocument)
      || item.doc === selectedDocument;

    if (hasSelectedDoc) {
      documentItems.push(enrichWithUsageData(item, processedData, selectedDocument));
    }

    return documentItems;
  }, []);
}

// Filters to media in folder (or subfolders) via precomputed usage metadata.
export function filterByFolder(data, selectedFolder, processedData) {
  if (!selectedFolder || !data) {
    return data;
  }

  const normalizedFolder = normalizeFolderPath(selectedFolder);
  let searchPath = '/';
  if (normalizedFolder !== '/' && normalizedFolder !== '') {
    searchPath = normalizedFolder.startsWith('/')
      ? normalizedFolder
      : `/${normalizedFolder}`;
  }

  return data.reduce((folderItems, item) => {
    const usageInfo = getUsageInfo(processedData, item);

    if (searchPath === '/') {
      if (usageInfo?.hasRootDoc) {
        const rootDoc = findMatchingDocForFolder(usageInfo, '/');
        folderItems.push(enrichWithUsageData(item, processedData, rootDoc));
      } else if (item.doc && isRootDocPath(item.doc)) {
        folderItems.push(enrichWithUsageData(item, processedData, item.doc));
      }
      return folderItems;
    }

    const hasFolderMatch = usageInfo?.folders?.some(
      (folderPath) => folderPath.startsWith(searchPath),
    );
    if (hasFolderMatch) {
      const matchingDoc = findMatchingDocForFolder(usageInfo, searchPath);
      folderItems.push(enrichWithUsageData(item, processedData, matchingDoc));
      return folderItems;
    }

    const folderPath = getFolderPathFromDoc(item.doc);
    if (folderPath && folderPath.startsWith(searchPath)) {
      folderItems.push(enrichWithUsageData(item, processedData, item.doc));
    }

    return folderItems;
  }, []);
}

export function getFilterLabel(filterType, count = 0) {
  const labels = {
    all: { singular: 'item', plural: 'items' },
    documents: { singular: 'PDF', plural: 'PDFs' },
    fragments: { singular: 'fragment', plural: 'fragments' },
    images: { singular: 'image', plural: 'images' },
    icons: { singular: 'SVG', plural: 'SVGs' },
    links: { singular: 'external asset', plural: 'external assets' },
    noReferences: { singular: 'item', plural: 'items' },
    videos: { singular: 'video', plural: 'videos' },
  };

  const label = labels[filterType] || labels.all;
  return pluralize(label.singular, label.plural, count);
}

export function computeResultSummary(mediaData, filteredData, searchQuery, filterType, opts = {}) {
  const { displayCount, displayCountCapped } = opts;
  const count = displayCount !== undefined ? displayCount : (filteredData?.length || 0);
  if (count === 0 && (!mediaData || mediaData.length === 0)) {
    return '';
  }
  const filterLabel = getFilterLabel(filterType, count);
  const countStr = displayCountCapped
    ? `${Number(count).toLocaleString()}+`
    : String(count);

  if (!searchQuery) {
    return `${countStr} ${filterLabel}`;
  }

  const colonSyntax = parseColonSyntax(searchQuery);

  if (colonSyntax) {
    const { field, value } = colonSyntax;

    if (field === 'folder') {
      const folderPath = value || '/';
      return `${countStr} ${filterLabel} in ${folderPath}`;
    }

    if (field === 'doc') {
      const docPath = value.replace(/\.html$/, '');
      return `${countStr} ${filterLabel} in ${docPath}`;
    }

    return `${countStr} ${filterLabel}`;
  }

  return `${countStr} ${filterLabel}`;
}

// Applies search, document, folder, type filters in order.
export function filterMedia(sourceData, options) {
  const {
    searchQuery,
    selectedDocument,
    selectedFolder,
    selectedFilterType,
    processedData,
    org,
    repo,
  } = options;

  if (!sourceData || sourceData.length === 0) {
    return [];
  }

  let data = sourceData.filter((item) => !isUiExcludedMediaItem(item));

  if (searchQuery && searchQuery.trim()) {
    data = filterBySearch(data, searchQuery, processedData);
  }

  if (selectedDocument) {
    data = filterByDocument(data, selectedDocument, processedData);
  }

  if (selectedFolder) {
    data = filterByFolder(data, selectedFolder, processedData);
  }

  if (selectedFilterType && selectedFilterType !== 'all' && selectedFilterType !== 'documentTotal') {
    return applyFilter(
      data,
      selectedFilterType,
      selectedDocument,
      org,
      repo,
    );
  }

  return data;
}

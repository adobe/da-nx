import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { daFetch } from '../../../../utils/daFetch.js';

const BLOCK_SCHEMA_PATH = '/.da/block-schema.json';
const SEO_GLOSSARY_PATH = '/.da/seo/glossary.json';

let blockSchemaCache;
let seoGlossaryLookupCache;

export function processSchemaKey(schemaKey) {
  const match = schemaKey.match(/^([\w-]+)\s*\((.*)\)$/);
  if (!match) {
    return {
      id: schemaKey,
      selector: `.${schemaKey}`,
    };
  }
  const [, blockType, classesStr] = match;
  const classes = classesStr.split(',').map((c) => c.trim()).sort();
  return {
    id: `${blockType}_${classes.join('_')}`,
    selector: `.${blockType}.${classes.join('.')}`,
  };
}

const fieldKeyCache = new Map();

export function fieldNameToKey(fieldName) {
  let key = fieldKeyCache.get(fieldName);
  if (key !== undefined) return key;
  key = fieldName
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars except word chars, spaces, hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Collapse multiple hyphens
  fieldKeyCache.set(fieldName, key);
  return key;
}

export function languageNameToCode(languageName, projectLangs) {
  const normalizedName = languageName.toLowerCase();
  const lang = projectLangs.find((l) => l.name?.toLowerCase() === normalizedName);
  return lang ? lang.code : null;
}

export function parseBlockSchema(schemaData) {
  const parsedSchema = {};

  Object.keys(schemaData).forEach((key) => {
    if (key.startsWith(':')) return;
    const blockData = schemaData[key];
    if (!blockData.data) return;
    const { id, selector } = processSchemaKey(key);
    const fields = [];
    blockData.data.forEach((field) => {
      const fieldName = field['field name'];
      const charCount = field['character count'];
      const keywordsInjection = field['keywords injection'];
      if (!fieldName) return;
      const hasCharCount = charCount && charCount.trim() !== '';
      const hasKeywordsInjection = !!(keywordsInjection
        && ['yes', 'true'].includes(keywordsInjection.toLowerCase()));
      if (hasCharCount || hasKeywordsInjection) {
        fields.push({
          fieldName,
          fieldKey: fieldNameToKey(fieldName),
          charCount: hasCharCount ? charCount : '',
          keywordsInjection: hasKeywordsInjection,
        });
      }
    });
    if (fields.length > 0) {
      parsedSchema[id] = {
        selector,
        fields,
      };
    }
  });
  return parsedSchema;
}

async function fetchJson(org, site, relativePath) {
  const url = `${DA_ORIGIN}/source/${org}/${site}${relativePath}`;
  try {
    const resp = await daFetch(url);
    if (!resp.ok) return null;
    return resp.json();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching site JSON:', relativePath, error);
    return null;
  }
}

export async function fetchBlockSchema(org, site, { reset = false } = {}) {
  if (blockSchemaCache && !reset) return blockSchemaCache;
  const schemaData = await fetchJson(org, site, BLOCK_SCHEMA_PATH);
  if (!schemaData) return null;
  const parsedSchema = parseBlockSchema(schemaData);
  blockSchemaCache = parsedSchema;
  return parsedSchema;
}

export function needsKeywordsMetadata(parsedSchema) {
  if (!parsedSchema || Object.keys(parsedSchema).length === 0) return false;
  const hasKeywords = (block) => block.fields.some((f) => f.keywordsInjection);
  return Object.values(parsedSchema).some(hasKeywords);
}

export async function fetchKeywordsFile(org, site, pagePath) {
  // Remove .html extension if present and add -keywords.json
  const cleanPath = pagePath.replace(/\.html$/, '');
  const keywordsPath = `${cleanPath}-keywords.json`;
  // Try primary path
  let url = `${DA_ORIGIN}/source/${org}/${site}${keywordsPath}`;
  try {
    const resp = await daFetch(url);
    if (resp.ok) {
      return resp.json();
    }
    // If 404 and path contains /langstore/, try fallback
    if (resp.status === 404 && keywordsPath.includes('/langstore/')) {
      const fallbackPath = keywordsPath.replace(/\/langstore\/[^/]+\//, '/');
      url = `${DA_ORIGIN}/source/${org}/${site}${fallbackPath}`;
      const fallbackResp = await daFetch(url);
      if (fallbackResp.ok) {
        return fallbackResp.json();
      }
    }
    return null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching keywords file:', error);
    return null;
  }
}

/**
 * Unwraps single <p> tags from block row divs
 * Converts <div><p>Text</p></div> to <div>Text</div>
 * Multi-paragraph content is preserved
 * @param {Document} doc - Parsed HTML document
 */
function unwrapSoleParagraphs(doc) {
  doc.querySelectorAll('div[class] > div > div').forEach((div) => {
    if (div.children.length === 1 && div.children[0].tagName === 'P') {
      const pTag = div.children[0];
      div.replaceChildren(...pTag.childNodes);
    }
  });
}

/**
 * Check if a div contains exactly the field name (with or without <p> wrapper)
 * Returns true only if:
 * - <div><p>Field Name</p></div> (and nothing else)
 * - <div>Field Name</div> (and nothing else)
 * Resilient to both unwrapped and wrapped content
 */
function isExactMatch(div, fieldName) {
  const trimmedFieldName = fieldName.trim();
  // Case 1: <div><p>Field Name</p></div> - p tag must have no children (only text)
  if (div.children.length === 1 && div.children[0].tagName === 'P' && div.children[0].children.length === 0) {
    return div.children[0].textContent.trim() === trimmedFieldName;
  }
  // Case 2: <div>Field Name</div> - no children at all
  if (div.children.length === 0) {
    return div.textContent.trim() === trimmedFieldName;
  }
  // Case 3: Any other structure (multiple children, nested elements) - no match
  return false;
}

export function annotateHTML(htmlContent, parsedSchema) {
  if (!htmlContent) {
    return htmlContent;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  unwrapSoleParagraphs(doc);
  if (!parsedSchema || Object.keys(parsedSchema).length === 0) {
    return doc.body.innerHTML;
  }
  Object.entries(parsedSchema).forEach(([blockId, block]) => {
    const { selector, fields } = block;
    const blockElements = doc.querySelectorAll(selector);
    blockElements.forEach((blockElement, blockIndex) => {
      const rows = blockElement.querySelectorAll(':scope > div');
      rows.forEach((row) => {
        const labelDiv = row.children[0];
        const contentDiv = row.children[1];
        if (!labelDiv || !contentDiv || labelDiv.tagName !== 'DIV' || contentDiv.tagName !== 'DIV') {
          return;
        }
        const field = fields.find((f) => isExactMatch(labelDiv, f.fieldName));
        if (!field) return;
        const { fieldName, fieldKey, charCount, keywordsInjection } = field;
        if (charCount) {
          contentDiv.setAttribute('its-storage-size', charCount);
        }
        const keywordsValue = String(keywordsInjection);
        const locNoteValue = `block-name=${blockId}_${blockIndex + 1}_${fieldKey}|fieldName=${fieldName}|apply-keywords=${keywordsValue}`;
        contentDiv.setAttribute('its-loc-note', locNoteValue);
        contentDiv.setAttribute('its-loc-note-type', 'description');
      });
    });
  });

  return doc.body.innerHTML;
}

export function buildLanguageMetadata(keywordsData, langs) {
  if (!keywordsData || !langs) return {};
  const targetLangCodes = new Set(langs.map((lang) => lang.code));
  const langCodeByName = new Map();
  const getLangCode = (languageName) => {
    const normalizedName = languageName.toLowerCase();
    let code = langCodeByName.get(normalizedName);
    if (code === undefined) {
      code = languageNameToCode(languageName, langs);
      langCodeByName.set(normalizedName, code);
    }
    return code;
  };
  const langMetadata = {};
  Object.entries(keywordsData).forEach(([key, blockData]) => {
    if (key.startsWith(':') || !blockData?.data) return;
    // Parse the key: "aso-app (apple, listing) (1)" -> blockId + index
    const indexMatch = key.match(/\((\d+)\)$/);
    if (!indexMatch) return;
    const index = indexMatch[1];
    const blockKeyWithoutIndex = key.replace(/\s*\(\d+\)$/, '').trim();
    const { id: blockId } = processSchemaKey(blockKeyWithoutIndex);
    // Process each language entry
    blockData.data.forEach((entry) => {
      const languageName = entry.language;
      if (!languageName) return;
      const langCode = getLangCode(languageName);
      if (!langCode || !targetLangCodes.has(langCode)) return;
      if (!langMetadata[langCode]) {
        langMetadata[langCode] = {};
      }
      Object.keys(entry).forEach((fieldName) => {
        if (fieldName === 'language') return;
        const keywordValue = entry[fieldName];
        if (!keywordValue || !keywordValue.trim()) return;
        const fieldKey = fieldNameToKey(fieldName);
        const metadataKey = `keywords|${blockId}_${index}_${fieldKey}`;
        langMetadata[langCode][metadataKey] = keywordValue;
      });
    });
  });

  return langMetadata;
}

function normalizeGlossaryPath(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return '';
  const path = urlOrPath
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/\/langstore\/en\//g, '/')
    .replace(/\.html$/i, '')
    .replace(/\/index$/, '')
    .trim();
  return path.startsWith('/') ? path : `/${path}`;
}

function extractGlossaryPathPrefixes(raw) {
  const rows = raw?.[':private']?.['private-stage-prefixes']?.data;
  if (!Array.isArray(rows)) return [];
  const pathPrefixes = [];
  rows.forEach((row) => {
    const trimmedPrefix = typeof row.prefixes === 'string' ? row.prefixes.trim() : '';
    if (!trimmedPrefix) return;
    pathPrefixes.push(trimmedPrefix.endsWith('/') ? trimmedPrefix : `${trimmedPrefix}/`);
  });
  return [...new Set(pathPrefixes)].sort((a, b) => b.length - a.length);
}

export function buildSeoGlossaryLookup(raw) {
  const pathPrefixes = extractGlossaryPathPrefixes(raw);
  const byLocale = new Map();
  Object.keys(raw).forEach((key) => {
    if (key.startsWith(':')) return;
    const sheet = raw[key];
    if (!sheet?.data || !Array.isArray(sheet.data)) return;
    const pathMap = new Map();
    sheet.data.forEach((row) => {
      const path = normalizeGlossaryPath(row.URL || '');
      if (!path) return;
      if (!pathMap.has(path)) pathMap.set(path, []);
      pathMap.get(path).push(row);
    });
    byLocale.set(key, pathMap);
  });
  return { pathPrefixes, byLocale };
}

function glossaryPagePathForLookup(pagePathNormalized, pathPrefixes) {
  for (const prefix of pathPrefixes) {
    if (prefix && pagePathNormalized.startsWith(prefix)) {
      const rest = pagePathNormalized.slice(prefix.length);
      if (!rest) return pagePathNormalized;
      return rest.startsWith('/') ? rest : `/${rest}`;
    }
  }
  return pagePathNormalized;
}

function buildLanguageContextForUrl(glossaryLookup, pagePathNormalized, targetLocales) {
  if (!glossaryLookup?.byLocale || !pagePathNormalized || !targetLocales?.length) return null;
  const lookupPath = glossaryPagePathForLookup(pagePathNormalized, glossaryLookup.pathPrefixes);
  const context = {};
  const targetSet = new Set(targetLocales);
  for (const locale of targetSet) {
    const pathMap = glossaryLookup.byLocale.get(locale);
    if (pathMap) {
      const rowsForUrl = pathMap.get(lookupPath) ?? [];
      if (rowsForUrl.length > 0) {
        const bySource = new Map();
        for (const row of rowsForUrl) {
          const sourceKeyword = String(row['EN KEYWORDS'] ?? '').trim();
          const keyword = String(row['TRANSLATED KEYWORDS'] ?? '').trim();
          if (sourceKeyword && keyword) {
            const msv = String(row['LOCAL MSV'] ?? '').trim();
            const priority = String(row['LOCAL PRIORITY'] ?? '').trim();
            const targetEntry = { keyword, msv, priority };
            if (!bySource.has(sourceKeyword)) {
              bySource.set(sourceKeyword, []);
            }
            bySource.get(sourceKeyword).push(targetEntry);
          }
        }
        const keywords = Array.from(bySource.entries()).map(([sourceKeyword, targetKeywords]) => ({
          sourceKeyword,
          targetKeywords,
        }));
        if (keywords.length > 0) {
          context[locale] = { keywords };
        }
      }
    }
  }
  return Object.keys(context).length > 0 ? context : null;
}

export async function loadSeoGlossary(org, site, { reset = false } = {}) {
  if (reset) {
    seoGlossaryLookupCache = undefined;
  }
  if (seoGlossaryLookupCache !== undefined) return;
  const raw = await fetchJson(org, site, SEO_GLOSSARY_PATH);
  seoGlossaryLookupCache = raw ? buildSeoGlossaryLookup(raw) : null;
}

export function addSeoGlossary(urls, langs) {
  if (!urls?.length || !langs?.length) return;
  const glossaryLookup = seoGlossaryLookupCache;
  if (!glossaryLookup) return;
  const targetLocales = langs.map((lang) => lang.code);
  urls.forEach((url) => {
    const pagePath = url.suppliedPath ?? url.daBasePath ?? '';
    const pagePathNormalized = normalizeGlossaryPath(pagePath);
    if (!pagePathNormalized) return;
    const languageContext = buildLanguageContextForUrl(
      glossaryLookup,
      pagePathNormalized,
      targetLocales,
    );
    if (languageContext) {
      url.languageContext = languageContext;
    }
  });
}

/**
 * Add translation metadata to URLs (HTML annotation + keywords + SEO glossary languageContext)
 * Modifies url.content, url.translationMetadata, and url.languageContext in place
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {Array} langs - Array of language objects with .name and .code
 * @param {Array} urls - Array of URL objects with .content and .suppliedPath
 */
export async function addTranslationMetadata(org, site, langs, urls) {
  // Block schema flow (HTML annotation + per-page keywords)
  const blockSchema = await fetchBlockSchema(org, site);
  if (blockSchema) {
    const hasKeywords = needsKeywordsMetadata(blockSchema);
    await Promise.all(urls.map(async (url) => {
      if (url.content && typeof url.content === 'string') {
        url.content = annotateHTML(url.content, blockSchema);
      }
      if (!hasKeywords) return;
      const keywordsData = await fetchKeywordsFile(org, site, url.suppliedPath);
      if (!keywordsData) return;
      const langMetadata = buildLanguageMetadata(keywordsData, langs);
      if (langMetadata && Object.keys(langMetadata).length > 0) {
        url.translationMetadata = langMetadata;
      }
    }));
  }

  // SEO glossary: if /.da/seo/glossary.json exists, add languageContext for GLaaS
  await loadSeoGlossary(org, site);
  addSeoGlossary(urls, langs);
}

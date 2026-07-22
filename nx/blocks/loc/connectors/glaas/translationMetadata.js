import { DA_ADMIN } from '../../../../../nx2/utils/utils.js';
import { daFetch } from '../../../../../nx2/utils/api.js';
import { shouldLogGLaaSRequests } from './api.js';

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
  const url = `${DA_ADMIN}/source/${org}/${site}${relativePath}`;
  try {
    const resp = await daFetch({ url });
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

const CONSTANT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONSTANT_TOKEN_PATTERN = /\{\{([a-z0-9]+(-[a-z0-9]+)*)\}\}/g;

function metadataPathForPage(pagePath, suffix) {
  const cleanPath = pagePath.replace(/\.html$/, '');
  return `${cleanPath}${suffix}`;
}

async function fetchMetadataFile(org, site, pagePath, suffix, readBody) {
  const metadataPath = metadataPathForPage(pagePath, suffix);
  let url = `${DA_ADMIN}/source/${org}/${site}${metadataPath}`;
  try {
    let resp = await daFetch({ url });
    if (resp.ok) {
      return readBody(resp);
    }
    if (resp.status === 404 && metadataPath.includes('/langstore/')) {
      const fallbackPath = metadataPath.replace(/\/langstore\/[^/]+\//, '/');
      url = `${DA_ADMIN}/source/${org}/${site}${fallbackPath}`;
      resp = await daFetch({ url });
      if (resp.ok) {
        return readBody(resp);
      }
    }
    return null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching page metadata file:', suffix, error);
    return null;
  }
}

export async function fetchKeywordsFile(org, site, pagePath) {
  return fetchMetadataFile(org, site, pagePath, '-keywords.json', (resp) => resp.json());
}

export async function fetchConstantsFile(org, site, pagePath) {
  return fetchMetadataFile(org, site, pagePath, '-constants.html', (resp) => resp.text());
}

function collectConstantSlugsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const slugs = new Set();
  const pattern = new RegExp(CONSTANT_TOKEN_PATTERN.source, CONSTANT_TOKEN_PATTERN.flags);
  let match = pattern.exec(text);
  while (match) {
    const slug = match[1];
    if (CONSTANT_SLUG_PATTERN.test(slug)) slugs.add(slug);
    match = pattern.exec(text);
  }
  return [...slugs].sort();
}

function getConstantsBlockBySlug(doc, slug) {
  if (!doc || !slug || !CONSTANT_SLUG_PATTERN.test(slug)) return null;
  return doc.querySelector(`main > div > div.${CSS.escape(slug)}`);
}

function constantsRowsFromHtml(html, slugs = []) {
  if (!html || typeof html !== 'string' || slugs.length === 0) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const byLanguage = new Map();
  slugs.forEach((slug) => {
    const block = getConstantsBlockBySlug(doc, slug);
    if (!block) return;
    Array.from(block.children).forEach((row) => {
      if (row.tagName !== 'DIV' || row.children.length < 2) return;
      const language = row.children[0].textContent.trim();
      const value = row.children[1].innerHTML.trim();
      if (!language || !value) return;
      if (!byLanguage.has(language)) byLanguage.set(language, {});
      byLanguage.get(language)[slug] = value;
    });
  });
  return [...byLanguage.entries()].map(([language, slugValues]) => ({
    language,
    slugs: slugValues,
  }));
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

function forEachMetadataField(doc, parsedSchema, visitField) {
  if (!parsedSchema || Object.keys(parsedSchema).length === 0) return;
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
        visitField({
          blockId,
          blockIndex: blockIndex + 1,
          field,
          contentDiv,
        });
      });
    });
  });
}

function fieldConstantSlugs(pageDoc, parsedSchema) {
  if (!pageDoc || !parsedSchema) return [];
  const fieldsWithSlugs = [];
  forEachMetadataField(pageDoc, parsedSchema, ({ blockId, blockIndex, field, contentDiv }) => {
    const slugs = collectConstantSlugsFromText(contentDiv.innerHTML);
    if (slugs.length === 0) return;
    fieldsWithSlugs.push({
      blockId,
      blockIndex,
      fieldKey: field.fieldKey,
      slugs,
    });
  });
  return fieldsWithSlugs;
}

function annotateHTML(htmlContent, parsedSchema) {
  if (!htmlContent) {
    return htmlContent;
  }
  const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
  unwrapSoleParagraphs(doc);
  forEachMetadataField(doc, parsedSchema, ({
    blockId, blockIndex, field, contentDiv,
  }) => {
    const { fieldName, fieldKey, charCount, keywordsInjection } = field;
    if (charCount) {
      contentDiv.setAttribute('its-storage-size', charCount);
    }
    const keywordsValue = String(keywordsInjection);
    const locNoteValue = `block-name=${blockId}_${blockIndex}_${fieldKey}|fieldName=${fieldName}|apply-keywords=${keywordsValue}`;
    contentDiv.setAttribute('its-loc-note', locNoteValue);
    contentDiv.setAttribute('its-loc-note-type', 'description');
  });

  return doc;
}

function normalizeColumnKey(key) {
  return typeof key === 'string' ? key.trim() : '';
}

export function isUpdatedColumn(key) {
  return normalizeColumnKey(key).endsWith(' (updated)');
}

export function parseUpdatedFlag(cell) {
  const val = normalizeColumnKey(cell).toLowerCase();
  if (!val) return false;
  return val === 'yes' || val === 'true';
}

function updatedColumnName(fieldName) {
  return `${normalizeColumnKey(fieldName)} (updated)`;
}

function normalizedEntryLookup(entry) {
  const lookup = new Map();
  Object.entries(entry).forEach(([key, value]) => {
    lookup.set(normalizeColumnKey(key), value);
  });
  return lookup;
}

function keywordFieldNamesFromEntry(entry) {
  const names = new Set();
  Object.keys(entry).forEach((key) => {
    const normalized = normalizeColumnKey(key);
    if (normalized === 'language' || isUpdatedColumn(normalized)) return;
    names.add(normalized);
  });
  return [...names];
}

function buildKeywordMetadataValue(keywordValue, updatedCell) {
  const updated = parseUpdatedFlag(updatedCell);
  const value = typeof keywordValue === 'string' ? keywordValue.trim() : '';
  if (!value && !updated) return null;
  return { value, updated };
}

function isSingleSheetKeywords(json) {
  return json?.[':type'] === 'sheet' && Array.isArray(json.data);
}

export function normalizeKeywordsFile(json) {
  if (!json || !isSingleSheetKeywords(json)) return json;
  const sheetName = typeof json[':sheetname'] === 'string' ? json[':sheetname'].trim() : '';
  if (!sheetName) {
    if (shouldLogGLaaSRequests()) {
      // eslint-disable-next-line no-console -- dev GLaaS handoff (glaas.log)
      console.warn('[keywords] Single-sheet keywords file is missing :sheetname; skipping keyword metadata.');
    }
    return null;
  }
  const { data, total, offset, limit, ':colWidths': colWidths } = json;
  const sheet = { total, offset, limit, data };
  if (colWidths) sheet[':colWidths'] = colWidths;
  return {
    ':type': 'multi-sheet',
    ':names': [sheetName],
    [sheetName]: sheet,
  };
}

function buildLanguageMetadata(keywordsData, langs, {
  constantsHtml,
  pageDoc,
  fieldsWithSlugs: providedFieldsWithSlugs,
  parsedSchema,
} = {}) {
  if (!langs) return {};
  const targetLangCodes = new Set(langs.map((lang) => lang.code));
  const langCodeByName = new Map();
  const langCodeForName = (languageName) => {
    if (!languageName) return null;
    const normalizedName = languageName.toLowerCase();
    let code = langCodeByName.get(normalizedName);
    if (code === undefined) {
      code = languageNameToCode(languageName, langs);
      langCodeByName.set(normalizedName, code);
    }
    return code;
  };
  const langMetadata = {};

  const normalizedKeywords = normalizeKeywordsFile(keywordsData);
  if (normalizedKeywords) {
    Object.entries(normalizedKeywords).forEach(([key, blockData]) => {
      if (key.startsWith(':') || !blockData?.data) return;
      const indexMatch = key.match(/\((\d+)\)$/);
      if (!indexMatch) return;
      const index = indexMatch[1];
      const blockKeyWithoutIndex = key.replace(/\s*\(\d+\)$/, '').trim();
      const { id: blockId } = processSchemaKey(blockKeyWithoutIndex);
      blockData.data.forEach((entry) => {
        const languageName = entry.language;
        if (!languageName) return;
        const langCode = langCodeForName(languageName);
        if (!langCode || !targetLangCodes.has(langCode)) return;
        const rowLookup = normalizedEntryLookup(entry);
        keywordFieldNamesFromEntry(entry).forEach((fieldName) => {
          const keywordMetadata = buildKeywordMetadataValue(
            rowLookup.get(fieldName),
            rowLookup.get(updatedColumnName(fieldName)),
          );
          if (!keywordMetadata) return;
          if (!langMetadata[langCode]) {
            langMetadata[langCode] = {};
          }
          const fieldKey = fieldNameToKey(fieldName);
          const metadataKey = `keywords|${blockId}_${index}_${fieldKey}`;
          langMetadata[langCode][metadataKey] = keywordMetadata;
        });
      });
    });
  }

  const fieldsWithSlugs = providedFieldsWithSlugs
    ?? (pageDoc && parsedSchema ? fieldConstantSlugs(pageDoc, parsedSchema) : []);
  if (constantsHtml && fieldsWithSlugs.length > 0) {
    const neededSlugs = [...new Set(fieldsWithSlugs.flatMap(({ slugs }) => slugs))];
    constantsRowsFromHtml(constantsHtml, neededSlugs).forEach(({ language, slugs }) => {
      const langCode = langCodeForName(language);
      if (!langCode || !targetLangCodes.has(langCode)) return;
      fieldsWithSlugs.forEach(({ blockId, blockIndex, fieldKey, slugs: fieldSlugs }) => {
        const placeholders = fieldSlugs.reduce((acc, slug) => {
          const value = slugs[slug];
          if (value) acc[slug] = value;
          return acc;
        }, {});
        if (Object.keys(placeholders).length === 0) return;
        if (!langMetadata[langCode]) langMetadata[langCode] = {};
        const metadataKey = `placeholders|${blockId}_${blockIndex}_${fieldKey}`;
        langMetadata[langCode][metadataKey] = placeholders;
      });
    });
  }

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

function logGlaasLangMetadata(pagePath, langMetadata) {
  if (!shouldLogGLaaSRequests()) return;
  // eslint-disable-next-line no-console -- dev GLaaS handoff (glaas.log)
  console.info(
    `[GLaaS langMetadata] ${pagePath}\n`,
    JSON.stringify({ langMetadata }, null, 2),
  );
}

/**
 * Add translation metadata to URLs (HTML annotation + keywords + placeholders + SEO glossary)
 * Modifies url.content, url.translationMetadata, and url.languageContext in place
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {Array} langs - Array of language objects with .name and .code
 * @param {Array} urls - Array of URL objects with .content and .suppliedPath
 */
export async function addTranslationMetadata(org, site, langs, urls) {
  const blockSchema = await fetchBlockSchema(org, site);
  if (blockSchema) {
    const hasKeywords = needsKeywordsMetadata(blockSchema);
    await Promise.all(urls.map(async (url) => {
      let pageDoc = null;
      let fieldsWithSlugs = [];
      if (url.content && typeof url.content === 'string') {
        pageDoc = annotateHTML(url.content, blockSchema);
        url.content = pageDoc.body.innerHTML;
        fieldsWithSlugs = fieldConstantSlugs(pageDoc, blockSchema);
      }

      const needsConstants = fieldsWithSlugs.length > 0;
      const [keywordsData, constantsHtml] = await Promise.all([
        hasKeywords ? fetchKeywordsFile(org, site, url.suppliedPath) : null,
        needsConstants ? fetchConstantsFile(org, site, url.suppliedPath) : null,
      ]);

      const translationMetadata = buildLanguageMetadata(keywordsData, langs, {
        constantsHtml,
        fieldsWithSlugs,
        parsedSchema: blockSchema,
      });

      if (Object.keys(translationMetadata).length > 0) {
        url.translationMetadata = translationMetadata;
        logGlaasLangMetadata(url.suppliedPath, translationMetadata);
      }
    }));
  }

  await loadSeoGlossary(org, site);
  addSeoGlossary(urls, langs);
}

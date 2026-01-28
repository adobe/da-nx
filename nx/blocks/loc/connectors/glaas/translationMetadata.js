import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { daFetch } from '../../../../utils/daFetch.js';

const BLOCK_SCHEMA_PATH = '/.da/block-schema.json';

let BLOCK_SCHEMA_CACHE;

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
    id : `${blockType}_${classes.join('_')}`, 
    selector: `.${blockType}.${classes.join('.')}` 
  };
}

export function fieldNameToKey(fieldName) {
  return fieldName
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars except word chars, spaces, hyphens
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-');      // Collapse multiple hyphens
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
      const hasKeywordsInjection = !!(keywordsInjection && 
        ['yes', 'true'].includes(keywordsInjection.toLowerCase()));
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

export async function fetchBlockSchema(org, site, { reset = false } = {}) {
  if (BLOCK_SCHEMA_CACHE && !reset) return BLOCK_SCHEMA_CACHE;
  const url = `${DA_ORIGIN}/source/${org}/${site}${BLOCK_SCHEMA_PATH}`;
  try {
    const resp = await daFetch(url);
    if (!resp.ok) return null;
    const schemaData = await resp.json();
    const parsedSchema = parseBlockSchema(schemaData);
    BLOCK_SCHEMA_CACHE = parsedSchema;
    return parsedSchema;
  } catch (error) {
    console.error('Error fetching block schema:', error);
    return null;
  }
}

export function needsKeywordsMetadata(parsedSchema) {
  if (!parsedSchema || Object.keys(parsedSchema).length === 0) return false;
  return Object.values(parsedSchema).some((block) =>
    block.fields.some((field) => field.keywordsInjection)
  );
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
  doc.querySelectorAll('div[class]').forEach((block) => {
    const rows = block.querySelectorAll(':scope > div');
    rows.forEach((row) => {
      const columns = row.querySelectorAll(':scope > div');
      columns.forEach((div) => {
        if (div.children.length === 1 && div.children[0].tagName === 'P') {
          const pTag = div.children[0];
          div.replaceChildren(...pTag.childNodes);
        }
      });
    });
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
  Object.values(parsedSchema).forEach((block) => {
    const { selector, fields } = block;
    const blockElements = doc.querySelectorAll(selector);

    blockElements.forEach((blockElement, blockIndex) => {
      const blockId = Object.keys(parsedSchema).find(
        (id) => parsedSchema[id].selector === selector
      );
      const rows = blockElement.querySelectorAll(':scope > div');
      rows.forEach((row) => {
        const labelDiv = row.querySelector(':scope > div:nth-child(1)');
        const contentDiv = row.querySelector(':scope > div:nth-child(2)'); 
        if (!labelDiv || !contentDiv) return;
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
  const langMetadata = {};
  Object.keys(keywordsData).forEach((key) => {
    if (key.startsWith(':')) return; 
    const blockData = keywordsData[key];
    if (!blockData.data) return;
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
      const langCode = languageNameToCode(languageName, langs);
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

/**
 * Add translation metadata to URLs (HTML annotation + keywords)
 * Modifies url.content and url.translationMetadata in place
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {Array} langs - Array of language objects with .name and .code
 * @param {Array} urls - Array of URL objects with .content and .suppliedPath
 */
export async function addTranslationMetadata(org, site, langs, urls) {
  // Fetch block schema (cached)
  const blockSchema = await fetchBlockSchema(org, site);
  if (!blockSchema) {
    return; // No schema, no metadata
  }
  
  const hasKeywords = needsKeywordsMetadata(blockSchema);
  
  await Promise.all(urls.map(async (url) => {
    if (url.content && typeof url.content === 'string') {
      url.content = annotateHTML(url.content, blockSchema);
    }
      if (hasKeywords) {
        const keywordsData = await fetchKeywordsFile(org, site, url.suppliedPath);
        if (keywordsData) {
          const langMetadata = buildLanguageMetadata(keywordsData, langs);
          if (langMetadata && Object.keys(langMetadata).length > 0) {
            url.translationMetadata = langMetadata;
          }
        }
      }
  }));
}


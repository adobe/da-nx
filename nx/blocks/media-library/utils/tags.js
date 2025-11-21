// nx/blocks/media-library/utils/tags.js
import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { createSheet } from './utils.js';

export async function loadTagConfig(sitePath) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${sitePath}/library/tags.json`);
    if (resp.ok) {
      return await resp.json();
    }
  } catch (error) {
    console.error('[TAGS] Error loading tag config:', error); // eslint-disable-line no-console
  }
  return null;
}

export async function loadTaggedMedia(sitePath) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${sitePath}/.da/mediaindex/tagged-media.json`);
    if (resp.ok) {
      const data = await resp.json();
      return data.data || [];
    }
  } catch (error) {
    console.error('[TAGS] Error loading tagged media:', error); // eslint-disable-line no-console
  }
  return [];
}

export async function saveTaggedMedia(sitePath, taggedData) {
  const path = `${sitePath}/.da/mediaindex/tagged-media.json`;
  const formData = await createSheet(taggedData, 'sheet');
  
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`, {
      method: 'PUT',
      body: formData,
    });
    return resp.ok;
  } catch (error) {
    console.error('[TAGS] Error saving tagged media:', error); // eslint-disable-line no-console
    return false;
  }
}

export function buildTagIndex(taggedMediaData) {
  const tagToMedia = new Map();
  const mediaToTags = new Map();
  
  taggedMediaData.forEach((item) => {
    if (!item.url || !item.tags) return;
    
    const tags = item.tags.split(',').map((t) => t.trim()).filter(Boolean);
    mediaToTags.set(item.url, tags);
    
    tags.forEach((tag) => {
      if (!tagToMedia.has(tag)) {
        tagToMedia.set(tag, []);
      }
      tagToMedia.get(tag).push(item.url);
    });
  });
  
  return { tagToMedia, mediaToTags };
}

export function getLeafTags(taxonomy) {
  if (!taxonomy?.data) return [];
  
  const paths = taxonomy.data.map((t) => t.path);
  const leafTags = [];
  
  paths.forEach((path) => {
    const isLeaf = !paths.some((p) => p.startsWith(`${path}/`));
    if (isLeaf) {
      const parts = path.split('/');
      leafTags.push({
        path,
        name: parts[parts.length - 1],
        fullPath: path,
      });
    }
  });
  
  return leafTags.sort((a, b) => a.name.localeCompare(b.name));
}

export function generateTagSuggestions(taxonomy, query) {
  if (!taxonomy?.data || !query) return [];
  
  const q = query.toLowerCase();
  const suggestions = [];
  
  taxonomy.data.forEach((tag) => {
    const parts = tag.path.split('/');
    const leafName = parts[parts.length - 1];
    
    if (leafName.toLowerCase().includes(q) || tag.path.toLowerCase().includes(q)) {
      const parent = parts.length > 1 ? parts.slice(0, -1).join(' › ') : '';
      suggestions.push({
        type: 'tag',
        value: tag.path,
        display: leafName,
        parent,
        fullPath: tag.path,
      });
    }
  });
  
  return suggestions.slice(0, 10);
}

export async function updateMediaTags(sitePath, mediaUrls, tagsToAdd, currentTaggedData) {
  const taggedMap = new Map(currentTaggedData.map((item) => [item.url, item]));
  
  mediaUrls.forEach((url) => {
    const existing = taggedMap.get(url);
    if (existing) {
      const currentTags = existing.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const newTags = [...new Set([...currentTags, ...tagsToAdd])];
      existing.tags = newTags.join(', ');
    } else {
      taggedMap.set(url, {
        url,
        tags: tagsToAdd.join(', '),
        'tagged-by': 'user',
        'tagged-at': new Date().toISOString(),
      });
    }
  });
  
  const updatedData = Array.from(taggedMap.values());
  await saveTaggedMedia(sitePath, updatedData);
  return updatedData;
}


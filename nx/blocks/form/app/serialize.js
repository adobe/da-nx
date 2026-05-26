import json2html from './json2html.js';

function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function prune(value) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;

  if (Array.isArray(value)) {
    const filtered = value.map(prune).filter((item) => !isEmpty(item));
    return filtered.length === 0 ? undefined : filtered;
  }

  if (typeof value === 'object') {
    const result = {};
    for (const [key, propertyValue] of Object.entries(value)) {
      const filtered = prune(propertyValue);
      if (filtered !== undefined && !isEmpty(filtered)) {
        result[key] = filtered;
      }
    }
    return Object.keys(result).length === 0 ? undefined : result;
  }

  return value;
}

export function serialize({ json }) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { error: 'Invalid JSON payload.' };
  }

  const pruned = prune(json.data);
  return {
    html: json2html({ ...json, data: pruned ?? {} }),
  };
}

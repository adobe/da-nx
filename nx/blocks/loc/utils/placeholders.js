export const ROLLOUT_CONFIG_PATH = '/.da/rollout-placeholders.json';

const TOKEN = /\{\{\s*([A-Za-z][\w.-]*)\s*\}\}/g;
const KEY = /^[A-Za-z][\w.-]*$/;
const VALUE = /^[\p{L}\p{M}\p{N} .,'-]{0,100}$/u;
const SLUG = /^[A-Za-z0-9-]+$/;
const HAS_HOST = /^([a-z][a-z0-9+.-]*:|\/\/)/i;
const AFTER_HOST = /^(https?:)?\/\/[^/?#]+[/?#]/i;
const TEXT_ATTRS = new Set(['alt', 'title']);
const LINK_ATTRS = new Set(['href', 'src']);
const SKIPPED_ELEMENTS = 'script, style, noscript, template, iframe, object, embed';
const DA_METADATA_SELECTOR = 'body > .da-metadata';

const countTokens = (str) => [...(str || '').matchAll(TOKEN)].length;

export function hasTokens(content) {
  if (!content || !content.includes('{{')) return false;
  return content.search(TOKEN) !== -1;
}

export function getTabName(root) {
  const trimmed = (root || '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed || '/';
}

function validateTab(name, sheet) {
  if (!sheet || typeof sheet !== 'object' || !Array.isArray(sheet.data)) {
    return { error: `tab "${name}" is not a valid sheet` };
  }
  if (Number.isInteger(sheet.total) && sheet.total > sheet.data.length) {
    return { error: `tab "${name}" is incomplete (${sheet.data.length} of ${sheet.total} rows)` };
  }
  const values = new Map();
  const errors = sheet.data.reduce((acc, row, idx) => {
    const line = `tab "${name}" row ${idx + 1}`;
    if (!row || typeof row !== 'object') return [...acc, `${line} is malformed`];
    const { key, value } = row;
    if ((key === undefined || key === '') && (value === undefined || value === '')) return acc;
    if (typeof key !== 'string' || !KEY.test(key)) return [...acc, `${line} has invalid key "${key ?? ''}"`];
    if (values.has(key)) return [...acc, `${line} duplicates key "${key}"`];
    if (value === undefined) return [...acc, `${line} has no value for "${key}"`];
    if (typeof value !== 'string') return [...acc, `${line} value for "${key}" must be text`];
    if (!VALUE.test(value)) {
      return [...acc, `${line} value for "${key}" may only contain letters, digits, spaces and . , ' - (up to 100 characters)`];
    }
    values.set(key, value);
    return acc;
  }, []);
  return errors.length ? { error: errors.join('; ') } : { values };
}

export function parseRolloutConfig(json) {
  if (!json || typeof json !== 'object') return { error: `${ROLLOUT_CONFIG_PATH} is not a valid sheet document` };
  if (Array.isArray(json[':names']) && json[':names'].every((name) => typeof name === 'string')) {
    return { tabs: new Map(json[':names'].map((name) => [name, json[name]])) };
  }
  if (typeof json[':sheetname'] === 'string') return { tabs: new Map([[json[':sheetname'], json]]) };
  return { error: `${ROLLOUT_CONFIG_PATH} must have one named tab per locale` };
}

export function getLocaleValues({ config, root }) {
  if (config.error) return config;
  const name = getTabName(root);
  if (!config.tabs.has(name)) return { passthrough: true };
  return validateTab(name, config.tabs.get(name));
}

function createReplacer({ values, errors }) {
  const lookup = (key, location) => {
    if (values.has(key)) return values.get(key);
    errors.push(`missing value for {{${key}}} (${location})`);
    return undefined;
  };

  const expandText = (template, location) => template
    .replace(TOKEN, (match, key) => lookup(key, location) ?? match);

  const expandLink = (template, location) => template.replace(TOKEN, (match, key, offset) => {
    const prefix = template.slice(0, offset).trim();
    if (!prefix || (HAS_HOST.test(prefix) && !AFTER_HOST.test(prefix))) {
      errors.push(`{{${key}}} must come after the start of a link and its host, such as /path/{{${key}}} (${location})`);
      return match;
    }
    const value = lookup(key, location);
    if (value === undefined) return match;
    if (SLUG.test(value)) return value;
    errors.push(`{{${key}}} in a link may only contain A-Z, a-z, 0-9 and - (${location})`);
    return match;
  });

  return { expandText, expandLink };
}

function describe(el) {
  const block = el.closest('main > div > div[class]');
  const tag = `<${el.tagName.toLowerCase()}>`;
  return block && block !== el ? `${tag} in ${block.classList[0]} block` : tag;
}

function findSplitTokens(doc) {
  return [...doc.body.querySelectorAll('*')].reduce((acc, el) => {
    const own = countTokens(el.textContent);
    if (!own) return acc;
    const children = [...el.childNodes]
      .reduce((sum, node) => sum + countTokens(node.textContent), 0);
    if (own > children) acc.push(`placeholder is split by formatting (${describe(el)})`);
    return acc;
  }, []);
}

export function expandHtml({ content, values }) {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  const errors = findSplitTokens(doc);
  const { expandText, expandLink } = createReplacer({ values, errors });
  const systemMetadata = doc.querySelector(DA_METADATA_SELECTOR);
  const isSkipped = (el) => systemMetadata?.contains(el) || el.closest(SKIPPED_ELEMENTS);

  doc.body.querySelectorAll('*').forEach((el) => {
    if (isSkipped(el)) return;
    [...el.attributes].forEach((attr) => {
      if (!hasTokens(attr.value)) return;
      const name = attr.name.toLowerCase();
      const location = `${name} on ${describe(el)}`;
      if (TEXT_ATTRS.has(name)) attr.value = expandText(attr.value, location);
      if (LINK_ATTRS.has(name)) attr.value = expandLink(attr.value, location);
    });
  });

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (hasTokens(node.data) && !isSkipped(node.parentElement)) {
      node.data = expandText(node.data, `text in ${describe(node.parentElement)}`);
    }
  }

  if (errors.length) return { errors };
  if (/<html[\s>]/i.test(content)) {
    const doctype = /^\s*<!doctype/i.test(content) ? '<!DOCTYPE html>\n' : '';
    return { content: `${doctype}${doc.documentElement.outerHTML}` };
  }
  if (/<body[\s>]/i.test(content)) return { content: doc.body.outerHTML };
  return { content: doc.body.innerHTML };
}

export function expandJson({ content, values }) {
  let json;
  try {
    json = JSON.parse(content);
  } catch {
    return { errors: ['content is not valid JSON'] };
  }
  const errors = [];
  const { expandText } = createReplacer({ values, errors });
  const walk = (value, path) => {
    if (typeof value === 'string') return hasTokens(value) ? expandText(value, path) : value;
    if (Array.isArray(value)) return value.map((item, idx) => walk(item, `${path}[${idx}]`));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => (
        [key, key.startsWith(':') ? item : walk(item, path ? `${path}.${key}` : key)]
      )));
    }
    return value;
  };
  const expanded = walk(json, '');
  return errors.length ? { errors } : { content: JSON.stringify(expanded) };
}

export function createRolloutResolver({ load, sitePath }) {
  let configPromise;
  const sources = {};

  const loadConfig = () => {
    configPromise ??= (async () => {
      try {
        const resp = await load(`${sitePath}${ROLLOUT_CONFIG_PATH}`);
        if (resp.status === 404) return { disabled: true };
        if (!resp.ok) return { error: `could not read ${ROLLOUT_CONFIG_PATH} (${resp.status})` };
        return parseRolloutConfig(await resp.json());
      } catch {
        return { error: `could not read ${ROLLOUT_CONFIG_PATH}` };
      }
    })();
    return configPromise;
  };

  const expand = async ({ content, root, path }) => {
    if (typeof content !== 'string' || path?.endsWith(ROLLOUT_CONFIG_PATH)) return { content };
    const isJson = path?.endsWith('.json');
    const tokenized = hasTokens(content) || (!isJson && content.includes('{{')
      && countTokens(new DOMParser().parseFromString(content, 'text/html').body.textContent) > 0);
    if (!tokenized) return { content };

    const config = await loadConfig();
    if (config.disabled) return { content };
    const { values, error, passthrough } = getLocaleValues({ config, root });
    if (passthrough) return { content };
    if (error) return { error: `${path}: ${error}` };

    const expandFn = isJson ? expandJson : expandHtml;
    const { content: expanded, errors } = expandFn({ content, values });
    if (errors) return { error: `${path}: ${errors.join('; ')}` };
    return { content: expanded };
  };

  const prepareSource = async (url) => {
    url.sourceHtml = undefined;
    if ((await loadConfig()).disabled) return {};
    sources[url.source] ??= load(url.source)
      .then((resp) => (resp.ok ? resp.text() : { status: resp.status }))
      .catch(() => ({}));
    const content = await sources[url.source];
    if (typeof content !== 'string') {
      return { error: `${url.destination}: could not read ${url.source}${content.status ? ` (${content.status})` : ''}` };
    }
    const { root, destination: path } = url;
    const { content: prepared, error } = await expand({ content, root, path });
    if (error) return { error };
    if (prepared !== content) url.sourceHtml = prepared;
    return {};
  };

  return { expand, prepareSource };
}

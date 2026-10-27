export const ROLLOUT_CONFIG_PATH = '/.da/rollout-placeholders.json';

const TOKEN = /\{\{\s*([A-Za-z][\w.-]*)\s*\}\}/g;
const WHOLE_TOKEN = /^\{\{\s*([A-Za-z][\w.-]*)\s*\}\}$/;
const KEY = /^[A-Za-z][\w.-]*$/;
const NESTED = /\{\{|\}\}/;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const UNSAFE_TEXT_SCHEME = /^\s*(javascript|vbscript|data|file|blob):/i;
const URL_TEMPLATE = /^(https?:\/\/|mailto:|tel:|\/|\.{1,2}\/)\S*$/i;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/; // eslint-disable-line no-control-regex
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data', 'background', 'xlink:href']);
const SRCSET_ATTRS = new Set(['srcset', 'imagesrcset']);
const UNSAFE_ATTRS = new Set(['style', 'srcdoc']);
const UNSAFE_ELEMENTS = 'script, style, noscript, template, iframe, object, embed';
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

export function isSafeUrl(href) {
  if (typeof href !== 'string' || CONTROL_CHARS.test(href)) return false;
  const scheme = href.trim().match(SCHEME)?.[1].toLowerCase();
  return !scheme || SAFE_SCHEMES.has(scheme);
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
    if (NESTED.test(value)) return [...acc, `${line} value for "${key}" cannot contain placeholders`];
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

  const expandUrl = (template, location) => {
    const trimmed = template.trim();
    const whole = trimmed.match(WHOLE_TOKEN);
    if (whole) {
      const value = lookup(whole[1], location);
      if (value === undefined) return template;
      if (!isSafeUrl(value)) {
        errors.push(`{{${whole[1]}}} is not a safe URL (${location})`);
        return template;
      }
      return template.replace(trimmed, () => value);
    }
    const before = errors.length;
    const result = template.replace(TOKEN, (match, key, offset) => {
      const prefix = template.slice(0, offset);
      if (!prefix.trim()) {
        errors.push(`{{${key}}} must be the whole URL or follow a scheme or path (${location})`);
        return match;
      }
      const value = lookup(key, location);
      if (value === undefined) return match;
      if (/^\s*[a-z][a-z0-9+.-]*:\/\/[^/?#]*$/i.test(prefix)) {
        if (/^[a-z0-9.-]+$/i.test(value)) return value;
        errors.push(`{{${key}}} is not a valid host name (${location})`);
        return match;
      }
      return encodeURIComponent(value);
    });
    if (errors.length === before && !isSafeUrl(result)) {
      errors.push(`resolved URL is not safe (${location})`);
      return template;
    }
    return result;
  };

  const expandSrcset = (template, location) => template.split(',')
    .map((candidate) => {
      const [url] = candidate.trim().split(/\s+/);
      if (!url || !hasTokens(url)) return candidate;
      return candidate.replace(url, () => expandUrl(url, location));
    })
    .join(',');

  const expandText = (template, location) => {
    const trimmed = template.trim();
    if (URL_TEMPLATE.test(trimmed)) return expandUrl(template, location);
    const whole = trimmed.match(WHOLE_TOKEN);
    if (whole) {
      const value = values.get(whole[1]);
      if (value !== undefined && UNSAFE_TEXT_SCHEME.test(value)) {
        errors.push(`{{${whole[1]}}} is not a safe value (${location})`);
        return template;
      }
    }
    return template.replace(TOKEN, (match, key) => lookup(key, location) ?? match);
  };

  return { expandUrl, expandSrcset, expandText };
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
  const { expandUrl, expandSrcset, expandText } = createReplacer({ values, errors });
  const systemMetadata = doc.querySelector(DA_METADATA_SELECTOR);

  [...doc.documentElement.querySelectorAll('*')].forEach((el) => {
    if (systemMetadata?.contains(el)) return;
    [...el.attributes].forEach((attr) => {
      if (!hasTokens(attr.value)) return;
      const location = `${attr.name} on ${describe(el)}`;
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || UNSAFE_ATTRS.has(name) || el.matches(UNSAFE_ELEMENTS)) {
        errors.push(`placeholders are not supported in ${location}`);
      } else if (URL_ATTRS.has(name)) {
        attr.value = expandUrl(attr.value, location);
      } else if (SRCSET_ATTRS.has(name)) {
        attr.value = expandSrcset(attr.value, location);
      } else {
        attr.value = expandText(attr.value, location);
      }
    });
  });

  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (hasTokens(node.data) && !systemMetadata?.contains(node)) {
      const location = `text in ${describe(parent)}`;
      if (parent.closest(UNSAFE_ELEMENTS)) {
        errors.push(`placeholders are not supported in ${location}`);
      } else {
        node.data = expandText(node.data, location);
      }
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
      .then((resp) => (resp.ok ? resp.text() : null))
      .catch(() => null);
    const content = await sources[url.source];
    if (content === null) return {};
    const { root, destination: path } = url;
    const { content: prepared, error } = await expand({ content, root, path });
    if (error) return { error };
    if (prepared !== content) url.sourceHtml = prepared;
    return {};
  };

  return { expand, prepareSource };
}

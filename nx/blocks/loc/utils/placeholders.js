export const ROLLOUT_CONFIG_PATH = '/.da/rollout-placeholders.json';

const TOKEN = /\{\{\s*([A-Za-z][\w.-]*)\s*\}\}/g;
const KEY = /^[A-Za-z][\w.-]*$/;
const VALUE = /^[\p{L}\p{M}\p{N} .,'-]{0,100}$/u;
const SLUG = /^[A-Za-z0-9-]+$/;
const HAS_HOST = /^([a-z][a-z0-9+.-]*:|\/\/)/i;
const AFTER_HOST = /^(https?:)?\/\/[^/?#]+[/?#]/i;
const URL_LIKE = /^(https?:\/\/|\/)(?:\{\{\s*[A-Za-z][\w.-]*\s*\}\}|\S)*$/i;
const ENCODED_TOKEN = /%7B%7B((?:%20|\s)*[A-Za-z][\w.-]*(?:%20|\s)*)%7D%7D/gi;
const DANGLING = /\{\{|\}\}/;
const TEXT_ATTRS = { a: ['title'], img: ['alt', 'title'] };
const LINK_ATTRS = { a: ['href'], img: ['src'] };
const SPLIT_SCOPE = 'p, li, td, th, h1, h2, h3, h4, h5, h6, div';
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
    if (value === undefined || value === '') return [...acc, `${line} has no value for "${key}"`];
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

const isUrlLike = (str) => URL_LIKE.test(str.trim());
const decodeBraces = (str) => str.replace(ENCODED_TOKEN, (m, inner) => `{{${inner.replace(/%20/gi, ' ')}}}`);

function textSlot({ template, set, location }) {
  return { template, original: template, set, link: isUrlLike(template), location };
}

function hasSplitToken(scope) {
  const walker = scope.ownerDocument.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let own = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) own += countTokens(node.data);
  return countTokens(scope.textContent) > own;
}

export function compileHtml(content) {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  const systemMetadata = doc.querySelector(DA_METADATA_SELECTOR);
  const slots = [];
  const errors = [];
  const checked = new Set();
  const acceptNode = (node) => (node.nodeType === Node.ELEMENT_NODE
    && (node === systemMetadata || node.matches(SKIPPED_ELEMENTS))
    ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT);
  // eslint-disable-next-line no-bitwise
  const show = NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT;
  const walker = doc.createTreeWalker(doc.body, show, { acceptNode });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const { data } = node;
      if (hasTokens(data)) {
        slots.push(textSlot({
          template: data,
          set: (value) => { node.data = value; },
          location: `text in ${describe(node.parentElement)}`,
        }));
      }
      const scope = DANGLING.test(data.replace(TOKEN, ''))
        && (node.parentElement.closest(SPLIT_SCOPE) || node.parentElement);
      if (scope && !checked.has(scope)) {
        checked.add(scope);
        if (hasSplitToken(scope)) errors.push(`placeholder is split by formatting (${describe(scope)})`);
      }
    } else {
      const tag = node.localName;
      [...(TEXT_ATTRS[tag] || []), ...(LINK_ATTRS[tag] || [])].forEach((name) => {
        const original = node.getAttribute(name);
        if (!original) return;
        const link = LINK_ATTRS[tag]?.includes(name);
        const template = link ? decodeBraces(original) : original;
        if (!hasTokens(template)) return;
        slots.push({
          template,
          original,
          set: (value) => node.setAttribute(name, value),
          link,
          location: `${name} on ${describe(node)}`,
        });
      });
    }
  }

  const serialize = () => {
    if (/<html[\s>]/i.test(content)) {
      const doctype = /^\s*<!doctype/i.test(content) ? '<!DOCTYPE html>\n' : '';
      return `${doctype}${doc.documentElement.outerHTML}`;
    }
    if (/<body[\s>]/i.test(content)) return doc.body.outerHTML;
    return doc.body.innerHTML;
  };

  return { slots, errors, serialize };
}

export function compileJson(content) {
  let json;
  try {
    json = JSON.parse(content);
  } catch {
    return { slots: [], errors: ['content is not valid JSON'] };
  }
  const slots = [];
  const walk = (parent, key, path) => {
    const value = parent[key];
    if (typeof value === 'string') {
      if (hasTokens(value)) {
        slots.push(textSlot({ template: value, set: (v) => { parent[key] = v; }, location: path }));
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach((child) => {
      if (child.startsWith(':')) return;
      const childPath = Array.isArray(value) ? `${path}[${child}]` : [path, child].filter(Boolean).join('.');
      walk(value, child, childPath);
    });
  };
  walk({ json }, 'json', '');
  return { slots, errors: [], serialize: () => JSON.stringify(json) };
}

export function applyPlaceholders({ compiled, values }) {
  const errors = [...compiled.errors];
  const { expandText, expandLink } = createReplacer({ values, errors });
  const results = compiled.slots.map(({ template, link, location }) => (
    link ? expandLink(template, location) : expandText(template, location)));
  if (errors.length) return { errors };
  compiled.slots.forEach((slot, idx) => slot.set(results[idx]));
  const content = compiled.serialize();
  compiled.slots.forEach((slot) => slot.set(slot.original));
  return { content };
}

export const expandHtml = ({ content, values }) => applyPlaceholders({
  compiled: compileHtml(content), values,
});

export const expandJson = ({ content, values }) => applyPlaceholders({
  compiled: compileJson(content), values,
});

export function createRolloutResolver({ load, sitePath }) {
  let configPromise;
  const sources = {};
  const compiled = {};
  const compile = (content, isJson) => {
    const key = `${isJson}:${content}`;
    compiled[key] ??= isJson ? compileJson(content) : compileHtml(content);
    return compiled[key];
  };

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
    const maybeTokens = hasTokens(content) || (!isJson
      && (/%7B%7B/i.test(content) || hasTokens(content.replace(/<[^>]*>/g, ''))));
    if (!maybeTokens) return { content };

    const config = await loadConfig();
    if (config.disabled) return { content };
    const { values, error, passthrough } = getLocaleValues({ config, root });
    if (passthrough) return { content };
    if (error) return { error: `${path}: ${error}` };

    const source = compile(content, isJson);
    if (!source.slots.length && !source.errors.length) return { content };
    const { content: expanded, errors } = applyPlaceholders({ compiled: source, values });
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

import { DA_ORIGIN, AEM_ORIGIN } from '../../public/utils/constants.js';
import { loadIms } from '../../utils/ims.js';

export function getDefaultData(page) {
  return {
    name: '', // Any
    type: 'ab', // ab, bandit
    goal: 'conversion', // conversion, form, engagement
    startDate: '', // 2025-03-31
    endDate: '', // 2025-03-31
    variants: [
      { percent: 50, url: page.url },
      { percent: 50, url: '' },
    ],
  };
}

/**
 * Convert a string to a hex color
 * @param {String} str
 * @returns hex color
 */
export function toColor(str) {
  return str === 'control' ? '--s2-orange-600' : '--s2-cyan-800';
}

/**
 * Convert name to a 2 letter capitalized abbreviation
 * @param {String} name
 * @returns A sentence case 2 letter abbreviation
 */
export function getAbb(name) {
  const [cap, lower] = name.slice(0, 2).split('');
  return `${cap.toUpperCase()}${lower}`;
}

function getName(variant, idx) {
  if (idx === 0) return 'control';
  if (variant.url) {
    const url = variant.url.endsWith('/') ? `${variant.url}index` : variant.url;
    return url.split('/').pop();
  }
  return `variant-${idx}`;
}

export function processDetails(experiment) {
  const { variants } = experiment;
  variants.forEach((variant, idx) => {
    variant.name = getName(variant, idx);
  });
  return { ...experiment, variants };
}

export function observeDetailsEdited(details, callback) {
  const PROPS_TO_OBSERVE = ['name', 'type', 'goal', 'startDate', 'endDate', 'percent', 'url'];

  const handler = {
    set(obj, prop, value) {
      obj[prop] = value;
      if (PROPS_TO_OBSERVE.includes(prop)) callback();
      return true;
    },
  };

  details.variants.forEach((variant, i) => {
    details.variants[i] = new Proxy(variant, handler);
  });

  return new Proxy(details, handler);
}

export function getOrgSite(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const [repo, org] = hostname.split('.')[0].split('--').slice(1).slice(-2);
    if (!(repo || org)) return { error: 'Please use AEM URLs' };
    return { repo, org, path: pathname.endsWith('/') ? `${pathname}index` : pathname };
  } catch {
    return { error: 'Could not make URL.' };
  }
}

function calcEditUrl(info, url) {
  if (!url || info.error) return null;
  return `https://da.live/edit#/${info.org}/${info.repo}${info.path}`;
}

function calcOpenUrl(info, url) {
  if (!url || info.error) return null;
  return url;
}

function calcPreviewParam(name, url, idx) {
  if (!(name || url) || url === '') return null;

  const expName = idx === 0 ? 'control' : `challenger-${idx}`;
  return encodeURI(`${name}/${expName}`);
}

export function calcLinks(name, variant, idx) {
  const { url } = variant;
  const info = getOrgSite(url);
  return {
    editUrl: calcEditUrl(info, url),
    openUrl: calcOpenUrl(info, url),
    previewParam: calcPreviewParam(name, url, idx),
  };
}

function propCheck(copy, prop, errorMsg) {
  if (!copy[prop]) {
    copy[prop] = errorMsg;
  } else {
    delete copy[prop];
  }
}

export function getErrors(details) {
  const required = { name: details.name, variants: details.variants };

  // Name
  propCheck(required, 'name', 'Experiment name is required.');

  // Variant check (maintain index order)
  required.variants = required.variants.map((variant) => {
    if (!variant.url) {
      variant.error = 'Missing URL';
      return variant;
    }
    const { org } = getOrgSite(variant.url);
    if (!org) {
      variant.error = 'Use AEM URLs';
    }
    delete variant.error;
    return variant;
  });

  // Destry the variant error object if no errors
  const variantErrors = required.variants.filter((variant) => variant.error).length;
  if (variantErrors === 0) delete required.variants;

  // Return if no errors
  if (Object.keys(required).length === 0) return null;

  // Return the errors into the details object
  return required;
}

function getRows(details) {
  const copy = JSON.parse(JSON.stringify(details));

  // Pop the control out of variants
  copy.variants.shift();

  const rows = [
    {
      key: 'experiment',
      value: copy.name,
    },
    {
      key: 'experiment-variants',
      value: copy.variants.map((variant) => variant.url).join(', '),
    },
    {
      key: 'experiment-split',
      value: copy.variants.map((variant) => variant.percent).join(', '),
    },
  ];
  if (copy.status) rows.push({ key: 'experiment-status', value: copy.status });
  if (copy.type) rows.push({ key: 'experiment-type', value: copy.type });
  if (copy.goal) rows.push({ key: 'experiment-goal', value: copy.goal });
  if (copy.startDate) rows.push({ key: 'experiment-start-date', value: copy.startDate });
  if (copy.endDate) rows.push({ key: 'experiment-end-date', value: copy.endDate });
  return rows;
}

function getDom(rows) {
  return rows.map((row) => {
    const rowEl = document.createElement('div');
    const keyEl = document.createElement('div');
    const valEl = document.createElement('div');
    rowEl.append(keyEl, valEl);
    keyEl.textContent = row.key;
    valEl.textContent = row.value;
    return rowEl;
  });
}

async function getToken() {
  const ims = await loadIms();
  if (ims.anonymous) return null;
  const { token } = ims.accessToken;
  return token;
}

async function aemReq(type, page) {
  const { org, repo, path } = getOrgSite(page.url);
  const token = await getToken();
  const opts = { method: 'POST', headers: { Authorization: `Bearer ${token}` } };
  const url = `${AEM_ORIGIN}/${type}/${org}/${repo}/main${path}`;
  const resp = await fetch(url, opts);
  if (!resp.ok) return { error: 'Error previewing doc.' };
  return resp.json();
}

async function getDaDetails(page, api = 'source') {
  const { org, repo, path } = getOrgSite(page.url);

  const token = await getToken();
  if (!token) return { error: 'Please login.' };

  const opts = { headers: { Authorization: `Bearer ${token}` } };
  const url = `${DA_ORIGIN}/${api}/${org}/${repo}${path}.html`;

  return { url, opts };
}

export async function checkAuth(page) {
  const { url, opts, error } = await getDaDetails(page, 'source');
  if (error) { return { ok: false, status: 401 }; }
  const res = await fetch(url, { ...opts, method: 'HEAD' });
  if (!res.ok) {
    return { ok: false, status: res.statusCode };
  }
  return { ok: true };
}

async function saveDoc(url, opts, doc) {
  const body = new FormData();

  const html = doc.body.outerHTML;
  const data = new Blob([html], { type: 'text/html' });
  body.append('data', data);

  opts.method = 'POST';
  opts.body = body;

  const resp = await fetch(url, opts);
  if (!resp.ok) return { error: 'Error saving to DA.' };
  return resp.json();
}

async function saveVersion(page, expName) {
  const { url, opts } = await getDaDetails(page, 'versionsource');
  opts.method = 'POST';
  opts.body = JSON.stringify({ label: `EXP: ${expName}` });
  await fetch(url, opts);
}

async function getDoc(url, opts) {
  const resp = await fetch(url, opts);
  const html = !resp.ok ? '<body><header></header><main><div></div></main><footer></footer></body>' : await resp.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

async function saveMetadata(page, dom) {
  const { url, opts } = await getDaDetails(page);

  const doc = await getDoc(url, opts);

  let metaBlock = doc.querySelector('.metadata');
  if (!metaBlock) {
    metaBlock = document.createElement('div');
    metaBlock.className = 'metadata';
    doc.body.querySelector('main div').append(metaBlock);
  }

  const metaRows = metaBlock.querySelectorAll(':scope > div');
  metaRows.forEach((row) => {
    // Likely a touch brittle, but fine for now.
    const text = row.children[0].textContent;
    if (text.startsWith('experiment')) {
      row.remove();
    }
  });
  metaBlock.append(...dom);
  const saved = await saveDoc(url, opts, doc);
  return saved;
}

export async function saveDetails(page, details, setStatus, forcePublish) {
  const rows = getRows(details);
  setStatus('Getting document.');
  const dom = getDom(rows);

  setStatus('Updating doc with experiment.');
  const result = await saveMetadata(page, dom);
  if (result.error) {
    setStatus(result.error, 'error');
    return null;
  }

  setStatus('Previewing document.');
  const preview = await aemReq('preview', page);
  if (preview.error) {
    setStatus(preview.error, 'error');
    return null;
  }

  if (details.status === 'active' || forcePublish) {
    setStatus('Publishing document.');
    const live = await aemReq('live', page);
    if (live.error) {
      setStatus(live.error, 'error');
      return null;
    }
    setStatus('Creating version.');
    await saveVersion(page, details.name);
  }

  setStatus();
  return { status: 'ok' };
}

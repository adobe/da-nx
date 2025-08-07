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
      { url: page.url },
      { url: '' },
    ],
  };
}

export const strings = {
  mab: 'Multi-armed bandit',
  ab: 'A/B Test',
  conversion: 'Overall conversion',
  'form-submit': 'Form submission',
  engagement: 'Engagement',
};

export function formatDate(timestamp) {
  // Force to local time
  const parsedDate = new Date(timestamp);
  const localDate = new Date(parsedDate.getTime() + (parsedDate.getTimezoneOffset() * 60000));

  // Put it into a decent looking format
  return localDate.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  // const time = localDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // return `${date} ${time}`;
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
  if (!name) return '';
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
  variants?.forEach((variant, idx) => {
    variant.name = getName(variant, idx);
  });
  return { ...experiment, variants };
}

export function calculatePercents(value, variants, indx) {
  // remove the control from the percent consideration
  const control = variants.shift();

  // Change the supplied index because of control removal
  const index = indx - 1;

  // Make a copy of our actual variants
  const updatedVariants = [...variants];

  // Determine how much our other variants add up to.
  const otherVariantsTotal = updatedVariants
    .reduce((sum, variant, idx) => (idx !== index ? sum + variant.percent : sum), 0);

  // 100 - our total is our max allowed value
  const maxAllowedValue = 100 - otherVariantsTotal;

  // Force the value into the max
  const clampedValue = Math.min(value, maxAllowedValue);

  // Update our existing array
  updatedVariants[index] = { ...updatedVariants[index], percent: clampedValue };

  // Calculate totals again as that is what's left for our control
  const newVariantsTotal = updatedVariants.reduce((sum, variant) => sum + variant.percent, 0);

  // Set the control percent
  control.percent = Math.max(0, 100 - newVariantsTotal);

  // Add it back into our variant list
  return [control, ...updatedVariants];
}

export function observeDetailChanges(details, callback) {
  const PROPS_TO_OBSERVE = ['name', 'type', 'goal', 'startDate', 'endDate', 'percent', 'url', 'variants'];

  const handler = {
    set(obj, prop, value) {
      obj[prop] = value;
      if (PROPS_TO_OBSERVE.includes(prop)) callback();
      return true;
    },
  };

  details.variants?.forEach((variant, i) => {
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
  ];

  const splits = copy.variants.reduce((acc, variant) => {
    if (variant.percent) acc.push(variant.percent);
    return acc;
  }, []);
  if (splits.length > 0) rows.push({ key: 'experiment-split', value: splits.join(', ') });

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

export async function getIsAllowed(page) {
  const { url, opts } = await getDaDetails(page, 'source');

  try {
    const res = await fetch(url, { ...opts, method: 'HEAD' });

    // We only care about 401 & 403. 404s could be net new pages.
    if (res.statusCode === 401 || res.statusCode === 403) return { ok: false };
  } catch (e) {
    console.log(e);
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

function getExperimentRows(metaBlock) {
  const metaRows = metaBlock.querySelectorAll(':scope > div');
  return [...metaRows].filter((row) => {
    // Likely a touch brittle, but fine for now.
    const text = row.children[0].textContent;
    return text.startsWith('experiment');
  });
}

async function deleteMetadata(page) {
  const { url, opts } = await getDaDetails(page);

  const doc = await getDoc(url, opts);

  const metaBlock = doc.querySelector('.metadata');
  if (!metaBlock) return { changed: false };

  const expRows = getExperimentRows(metaBlock);
  if (!expRows.length) return { changed: false };

  expRows.forEach((row) => row.remove());
  const saved = await saveDoc(url, opts, doc);
  return { ...saved, changed: true };
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

  getExperimentRows(metaBlock).forEach((row) => row.remove());
  metaBlock.append(...dom);
  const saved = await saveDoc(url, opts, doc);
  return saved;
}

async function previewAndPublish(page, details, setStatus, shouldPublish = false) {
  setStatus('Previewing document.');
  const preview = await aemReq('preview', page);
  if (preview.error) {
    setStatus(preview.error, 'error');
    return null;
  }

  if (details.status === 'draft') {
    if (!shouldPublish) {
      setStatus();
      return { status: 'ok' };
    }
  }

  setStatus('Publishing document.');
  const live = await aemReq('live', page);
  if (live.error) {
    setStatus(live.error, 'error');
    return null;
  }
  setStatus('Creating version.');
  await saveVersion(page, details.name);

  setStatus();
  return { status: 'ok' };
}

export async function deleteExperiment(page, details, setStatus, shouldPublish) {
  setStatus('Writing metadata.');
  const result = await deleteMetadata(page);

  if (!result.changed) {
    return { status: 'ok' };
  }

  return previewAndPublish(page, details, setStatus, shouldPublish);
}

export async function saveDetails(page, details, setStatus, shouldPublish = false) {
  const rows = getRows(details);
  setStatus('Getting document.');
  const dom = getDom(rows);

  setStatus('Updating doc with experiment.');
  const result = await saveMetadata(page, dom);
  if (result.error) {
    setStatus(result.error, 'error');
    return null;
  }

  // Saving a draft will put the details into a draft status.
  // We need to force publish in this case.
  const forcePublish = shouldPublish || details.status === 'active';

  return previewAndPublish(page, details, setStatus, forcePublish);
}

export function getStrings(el) {
  const string = {};

  const rows = [...el.querySelectorAll(':scope > div')];
  rows.forEach((row) => {
    const [keyEl, valEl] = row.querySelectorAll('div');
    const key = keyEl.textContent;

    const [part, category] = key.split('.');
    const val = valEl.textContent;

    string[part] = {
      ...string[part],
      [category]: val,
    };
  });

  return string;
}

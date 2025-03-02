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
  // let hash = 0;
  // str.split('').forEach((char) => {
  //   hash = char.charCodeAt(0) + ((hash << 5) - hash);
  // });
  // let color = '#';
  // for (let i = 0; i < 3; i += 1) {
  //   const value = (hash >> (i * 8)) & 0xff;
  //   color += value.toString(16).padStart(2, '0');
  // }
  // return color;
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
  console.log(experiment);
  const { variants } = experiment;
  variants.forEach((variant, idx) => {
    variant.name = getName(variant, idx);
  });
  return { ...experiment, variants };
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

async function getDoc(url, opts) {
  const resp = await fetch(url, opts);
  const html = !resp.ok ? '<body><header></header><main><div></div></main><footer></footer></body>' : await resp.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

async function saveMetadata(page, dom) {
  const { org, repo, path } = getOrgSite(page.url);

  const token = await getToken();
  if (!token) return { error: 'Please login.' };

  const opts = { headers: { Authorization: `Bearer ${token}` } };
  const url = `${DA_ORIGIN}/source/${org}/${repo}${path}.html`;

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

export async function saveDetails(page, details, setStatus) {
  const rows = getRows(details);
  setStatus('Getting document.');
  const dom = getDom(rows);

  setStatus('Updating document with experiment.');
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

  setStatus('Publishing document.');
  const live = await aemReq('live', page);
  if (live.error) {
    setStatus(live.error, 'error');
    return null;
  }
  setStatus();
  return { status: 'ok' };
}

import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { daFetch } from '../../../utils/daFetch.js';

const ROW_DNT = '.section-metadata > div';
const KEY_DNT = '.metadata > div';
const OPT_IN_KEYS = ['title', 'description'];

const RESP_ERROR = { error: 'Error fetching document for DNT.' };

const PARSER = new DOMParser();

// Not explicitly DNT, but part of an overall strategy to change the DOM before translation
function capturePics(dom) {
  const imgs = dom.querySelectorAll('picture img');
  imgs.forEach((img) => {
    [img.src] = img.getAttribute('src').split('?');
    const pic = img.closest('picture');
    pic.parentElement.replaceChild(img, pic);
  });
}

function captureDnt(dom) {
  const dntEls = dom.querySelectorAll(`${ROW_DNT}, ${KEY_DNT}`);
  dntEls.forEach((el) => {
    const keyEl = el.querySelector(':scope > div');
    const translateValue = OPT_IN_KEYS.some((key) => key === keyEl.textContent.toLowerCase());
    if (!translateValue) {
      el.dataset.innerHtml = el.innerHTML;
      el.innerHTML = '';
      return;
    }
    keyEl.dataset.innerHtml = keyEl.innerHTML;
    keyEl.innerHTML = '';
  });
  console.log(dom.querySelector('.metadata'));
  return dom.documentElement.outerHTML;
}

export function releaseDnt(dom) {
  const dntEls = dom.querySelectorAll('[data-inner-html]');
  dntEls.forEach((el) => {
    el.innerHTML = el.dataset.innerHtml;
    delete el.dataset.innerHtml;
  });
  return `<body>${dom.querySelector('main').outerHTML}</body>`;
}

export default async function dntFetch(url, type) {
  try {
    const resp = await daFetch(url);
    if (!resp.ok) return { ...RESP_ERROR, status: resp.staus };
    const html = await resp.text();
    const dom = PARSER.parseFromString(html, 'text/html');

    if (type === 'capture') {
      capturePics(dom);
      return captureDnt(dom);
    }
    return releaseDnt(dom);
  } catch {
    return { ...RESP_ERROR, status: 520 };
  }
}

export async function dntFetchAll(urls) {
  // Get all the source content
  await Promise.all(urls.map(async (url) => {
    const result = await dntFetch(`${DA_ORIGIN}/source${url.srcPath}`, 'capture');
    if (result.error) {
      url.error = result.error;
      url.status = result.status;
      return;
    }
    url.content = result;
  }));
}

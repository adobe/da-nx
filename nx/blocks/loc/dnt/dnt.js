const ROW_DNT = '.section-metadata > div';
const KEY_DNT = '.metadata > div';
const OPT_IN_KEYS = ['title', 'description'];

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

export function addDnt(html) {
  const dom = PARSER.parseFromString(html, 'text/html');

  capturePics(dom);
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
  return dom.documentElement.outerHTML;
}

export function removeDnt(html) {
  const dom = PARSER.parseFromString(html, 'text/html');
  const dntEls = dom.querySelectorAll('[data-inner-html]');
  dntEls.forEach((el) => {
    el.innerHTML = el.dataset.innerHtml;
    delete el.dataset.innerHtml;
  });
  return `<body>${dom.querySelector('main').outerHTML}</body>`;
}

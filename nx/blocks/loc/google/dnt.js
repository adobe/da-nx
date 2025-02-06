import { addDnt as addDntGlaas, removeDnt as removeDntGlaas } from '../glaas/dnt.js';

const PARSER = new DOMParser();

// The google dnt layer first uses the glaas dnt layer to add the dnt attributes
// Then it converts the glaas html to dom that google translate can process

export async function addDnt(inputText, config, fileType = 'html') {
  const glaasHtml = await addDntGlaas(inputText, config, fileType);
  const dom = PARSER.parseFromString(glaasHtml, 'text/html');
  const dntEls = dom.querySelectorAll('[translate="no"]');
  dntEls.forEach((el) => {
    const nestedTranslates = el.querySelectorAll('[translate="no"]');
    nestedTranslates.forEach((nestedEl) => nestedEl.removeAttribute('translate'));

    el.dataset.innerHtml = el.innerHTML;
    el.innerHTML = '';
    el.removeAttribute('translate');
  });

  return dom.documentElement.outerHTML;
}

export function removeDnt(inputHtml) {
  const html = removeDntGlaas(inputHtml);
  const dom = PARSER.parseFromString(html, 'text/html');
  const dntEls = dom.querySelectorAll('[data-inner-html]');
  dntEls.forEach((el) => {
    el.innerHTML = el.dataset.innerHtml;
    delete el.dataset.innerHtml;
  });
  const contents = dom.querySelector('main')?.outerHTML || dom.body.innerHTML;

  return `<body>${contents}</body>`;
}

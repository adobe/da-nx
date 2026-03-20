import { loadIms } from '../../scripts/utils/ims.js';

export default async function init(a) {
  const button = document.createElement('button');
  button.append(...a.childNodes);
  button.className = a.className;
  button.dataset.pathname = a.pathname;
  a.parentElement.replaceChild(button, a);

  const ims = await loadIms();
  console.log(ims);
  button.addEventListener('click', () => {
    window.adobeIMS.signIn();
  });
}

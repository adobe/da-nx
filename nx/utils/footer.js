import { getMetadata, loadBlock } from '../scripts/nexter.js';

(async function loadFooter() {
  const footer = document.querySelector('footer');
  if (!footer) return;
  const footerMeta = getMetadata('footer');
  if (footerMeta === 'off') {
    footer.remove();
    return;
  }
  footer.className = 'nx-footer cmp';

  // The lesser of evils to achieve the app frame.
  const main = document.body.querySelector('main');
  main.append(footer);

  loadBlock(footer);
}());

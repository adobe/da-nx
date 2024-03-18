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
  loadBlock(footer);
}());

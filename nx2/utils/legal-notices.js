import { getConfig } from '../scripts/nx.js';
import { loadStyle } from './utils.js';

export async function openLegalNotices() {
  try {
    const [{ loadFragment }, , formStyle] = await Promise.all([
      import('../blocks/fragment/fragment.js'),
      import('../blocks/shared/dialog/dialog.js'),
      loadStyle(new URL('../styles/form.css', import.meta.url).href),
    ]);
    const fragment = await loadFragment('/fragments/nav/help');
    if (!fragment) return;
    if (!document.adoptedStyleSheets.includes(formStyle)) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, formStyle];
    }
    const dialog = document.createElement('nx-dialog');
    dialog.style.setProperty('--nx-dialog-padding', 'var(--s2-spacing-400)');
    dialog.append(...fragment.children);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'nx-form-btn-secondary';
    closeBtn.slot = 'actions';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => dialog.close());
    dialog.append(closeBtn);
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
  } catch (error) {
    getConfig().log('Could not open legal notices dialog.', error);
  }
}

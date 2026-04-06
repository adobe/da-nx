import { loadFragment } from '../fragment/fragment.js';
import { showPanel, hidePanel, unhidePanel } from '../../utils/panel.js';

const FRAGMENT_PATHS = {
  before: '/nx/fragments/before-panel',
  after: '/nx/fragments/after-panel',
};

export default async function decorate(a) {
  const { hash } = new URL(a.href);
  if (hash !== '#_before' && hash !== '#_after') return;
  const beforeMain = hash === '#_before';
  const position = beforeMain ? 'before' : 'after';

  a.addEventListener('click', async (e) => {
    e.preventDefault();
    const existing = document.querySelector(`aside.panel[data-position="${position}"]`);
    if (existing) {
      if (existing.hidden) {
        unhidePanel(existing);
      } else {
        hidePanel(existing);
      }
      return;
    }
    const path = FRAGMENT_PATHS[position];
    const content = await loadFragment(path);
    if (content) showPanel({ width: '400px', beforeMain, content, fragment: path });
  });
}

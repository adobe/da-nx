async function togglePanel(position) {
  const existing = document.querySelector(`aside.panel[data-position="${position}"]`);
  if (!existing) return false;
  const { hidePanel, unhidePanel } = await import('../../utils/panel.js');
  if (existing.hidden) unhidePanel(existing);
  else hidePanel(existing);
  return true;
}

async function loadPanelContent(value) {
  if (value.includes('/fragments/')) {
    const { loadFragment } = await import('../fragment/fragment.js');
    return { content: await loadFragment(value), fragment: value };
  }
  const mod = await import(`../../../nx/blocks/${value}/${value}.js`);
  return { content: await mod.getPanel() };
}

function decoratePanel(a, hash) {
  const match = hash.match(/^#_(before|after)=(.+)$/);
  if (!match) return;
  const [, position, value] = match;
  const beforeMain = position === 'before';

  a.addEventListener('click', async (e) => {
    e.preventDefault();
    if (await togglePanel(position)) return;
    const { content, fragment } = await loadPanelContent(value);
    if (!content) return;
    const { showPanel } = await import('../../utils/panel.js');
    showPanel({ width: '400px', beforeMain, content, fragment });
  });
}

const ACTIONS = [
  { pathname: '/tools/widgets/panel', handler: decoratePanel },
];

export default async function decorate(a) {
  const action = ACTIONS.find((entry) => entry.pathname === a.pathname);
  if (!action) return;
  action.handler(a, a.hash);
}

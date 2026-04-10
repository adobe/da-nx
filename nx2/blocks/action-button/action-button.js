function decoratePanel(a, hash) {
  const match = hash.match(/^#_(before|after)=(.+)$/);
  if (!match) return;
  const [, position, value] = match;
  const beforeMain = position === 'before';

  a.addEventListener('click', async (e) => {
    e.preventDefault();
    const panel = await import('../../utils/panel.js');
    const existing = document.querySelector(`aside.panel[data-position="${position}"]`);
    if (existing) {
      if (existing.hidden) panel.unhidePanel(existing);
      else panel.hidePanel(existing);
      return;
    }
    await panel.openPanelWithFragment({
      width: panel.getDefaultPanelWidthCss(),
      beforeMain,
      fragment: value,
    });
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

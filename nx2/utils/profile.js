export function openProfileMenu({ navSelector = 'nx-nav', profileSelector = 'nx-profile' } = {}) {
  const nav = document.querySelector(navSelector);
  const profile = nav?.shadowRoot?.querySelector(profileSelector);
  const menu = profile?.shadowRoot?.querySelector('[popover]');
  if (!menu?.showPopover) return false;
  if (!menu.matches(':popover-open')) menu.showPopover();
  const target = menu.querySelector('.nx-menu-btn-org')
    ?? menu.querySelector('button, a[href], [tabindex]:not([tabindex="-1"])');
  target?.focus();
  return true;
}

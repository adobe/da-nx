import { loadFragment } from '../fragment/fragment.js';
import '../shared/menu/menu.js';

export function parseFeedbackItems(fragment) {
  // Descendant search (not :scope > p): loadFragment() wraps the authored
  // content div inside its own "fragment-content" div, so rows can be nested
  // one level deeper than fragment's direct children. Plain descendant search
  // works for both that shape and a bare div passed directly in tests.
  const rows = [...fragment.querySelectorAll('p')];
  return rows.reduce((items, p, index) => {
    const a = p.querySelector('a');
    if (!a) return items;

    const iconSpan = a.querySelector('span.icon');
    const iconClass = iconSpan
      ? [...iconSpan.classList].find((cls) => cls !== 'icon' && cls.startsWith('icon-'))
      : undefined;
    const icon = iconClass ? iconClass.slice('icon-'.length) : undefined;

    const href = a.getAttribute('href') || '';
    const em = p.querySelector('em');

    // loadFragment() runs the fragment's content through loadArea(), which
    // (via nx.js's decorateLink) can rewrite a same-origin hash-only href
    // like "#idea" into a path-qualified one like "/current-page#idea" once
    // the fragment is loaded on a real page. Look for the hash anywhere in
    // the href, not just at the start, so the id survives that rewrite.
    const hashIndex = href.indexOf('#');
    const id = hashIndex !== -1 ? href.slice(hashIndex + 1) : (icon || `link-${index}`);

    items.push({
      id,
      label: a.textContent.trim(),
      description: em ? em.textContent.trim() : undefined,
      icon,
      href,
    });
    return items;
  }, []);
}

/**
 * Opens the stub feedback dialog for an internal (#idea / #bug) item.
 * @param {{ id: string, label: string }} item
 */
export async function openFeedbackDialog(item) {
  await import('./feedback-dialog.js');

  const dialog = document.createElement('nx-feedback-dialog');
  dialog.label = item.label;
  document.body.append(dialog);
}

// A fully-qualified http(s) URL (e.g. the Discord link) opens externally;
// anything else — a bare "#idea" hash or one rewritten to a path-qualified
// "/current-page#idea" by decorateLink() during fragment loading — is one
// of our own internal actions and opens the stub dialog instead.
function isExternalLink(href) {
  return /^https?:\/\//i.test(href);
}

function handleSelect(menu, { detail: { id } }) {
  const item = menu.items?.find((i) => i.id === id);
  if (!item) return;

  if (!item.href || isExternalLink(item.href)) {
    if (item.href) window.open(item.href, '_blank', 'noopener,noreferrer');
    return;
  }

  openFeedbackDialog(item);
}

async function loadFeedbackItems(menu, path) {
  const fragment = await loadFragment(path);
  if (!fragment) return;
  menu.items = parseFeedbackItems(fragment);
}

/**
 * Turns an already-decorated dialog auto-block button (see
 * blocks/dialog/dialog.js, which turns a hash-linked fragment anchor into a
 * plain button) into a popover-menu trigger, instead of the generic
 * single-dialog behavior nav.js's decorateActions wires onto every other
 * data-pathname button.
 *
 * DOM produced: `<nx-menu><button slot="trigger">...</button></nx-menu>` —
 * no extra wrapper/controller element. Item loading and dialog behavior are
 * wired imperatively (loadFeedbackItems / handleSelect / openFeedbackDialog
 * above) directly onto the nx-menu instance.
 *
 * Called directly from nav.js — not registered as an auto-block itself —
 * so it works regardless of any consuming project's own linkBlocks config.
 * @param {HTMLButtonElement} button
 */
export function attachFeedbackMenu(button) {
  button.classList.add('nx-feedback');
  button.setAttribute('slot', 'trigger');

  const menu = document.createElement('nx-menu');
  menu.setAttribute('placement', 'below-end');
  menu.addEventListener('select', (e) => handleSelect(menu, e));

  button.replaceWith(menu);
  menu.append(button);

  loadFeedbackItems(menu, button.dataset.pathname);
}

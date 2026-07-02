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

    items.push({
      id: href.startsWith('#') ? href.slice(1) : (icon || `link-${index}`),
      label: a.textContent.trim(),
      description: em ? em.textContent.trim() : undefined,
      icon,
      href,
    });
    return items;
  }, []);
}

class NxFeedbackMenu extends HTMLElement {
  set path(value) { this._path = value; }

  get path() { return this._path; }
}

if (!customElements.get('nx-feedback-menu')) customElements.define('nx-feedback-menu', NxFeedbackMenu);

export default function init(a) {
  const button = document.createElement('button');
  button.append(...a.childNodes);
  button.className = a.className;
  button.dataset.pathname = a.pathname;
  button.setAttribute('slot', 'trigger');

  const wrapper = document.createElement('nx-feedback-menu');
  wrapper.path = a.pathname;
  wrapper.append(button);

  a.replaceWith(wrapper);
}

import { loc } from '../../scripts/nx.js';
import { loadStyle } from '../../utils/utils.js';

const style = await loadStyle(import.meta.url);

const ALL = 'all';

// Sections after the filter's own section; the first heading names the category.
const getManagedSections = (el) => {
  const own = el.closest('.section');
  const all = [...(own?.parentElement?.children ?? [])].filter((s) => s.classList.contains('section'));
  return all.slice(all.indexOf(own) + 1);
};

const getCategories = (sections) => sections.reduce((acc, section) => {
  const heading = section.querySelector('h1, h2, h3, h4, h5, h6');
  if (!heading?.id) return acc;
  return [...acc, { value: `category-${heading.id}`, label: heading.textContent.trim(), section }];
}, []);

const search = (query) => {
  const results = [];
  document.dispatchEvent(new CustomEvent('nx-cards-filter', { detail: { query, results } }));
  return results;
};

export default async function init(el) {
  if (!document.adoptedStyleSheets.includes(style)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
  }
  await Promise.all([
    import('../shared/segmented-btn/segmented.js'),
    import('../shared/search/search.js'),
  ]);

  const sections = getManagedSections(el);
  const categories = getCategories(sections);
  categories.forEach(({ value, section }) => { section.id = value; });

  const pills = document.createElement('nx-segmented-btn');
  pills.className = 'cards-filter-categories';
  pills.size = 'm';
  pills.label = loc`Filter tools by category`;
  const setItems = () => {
    pills.items = [
      { value: ALL, label: loc`All` },
      ...categories
        .filter(({ section }) => section.isConnected)
        .map(({ value, label }) => ({ value, label })),
    ];
  };
  setItems();
  pills.value = ALL;

  const field = document.createElement('nx-search');
  field.className = 'cards-filter-search';
  field.setAttribute('variant', 'field');
  field.size = 'm';
  field.label = loc`Search Tools`;
  field.placeholder = loc`Search Tools`;

  // Live region: stays in the DOM, only its text changes so screen readers announce it.
  const empty = document.createElement('p');
  empty.className = 'cards-filter-empty';
  empty.setAttribute('role', 'status');
  const setEmpty = (isEmpty) => { empty.textContent = isEmpty ? loc`No tools found` : ''; };

  const bar = document.createElement('div');
  bar.className = 'cards-filter-bar';
  bar.append(pills, field);
  el.replaceChildren(bar, empty);

  // The search field holds the current query.
  const getQuery = () => (field.value ?? '').trim();

  const showCategory = (value) => {
    sections.forEach((section) => { section.hidden = value !== ALL && section.id !== value; });
    setEmpty(false);
  };

  const applySearch = () => {
    const query = getQuery();
    const results = search(query);
    if (!query) {
      showCategory(ALL);
      return;
    }
    const matches = new Set(results.filter((r) => r.count > 0).map((r) => r.section));
    sections.forEach((section) => { section.hidden = !matches.has(section); });
    setEmpty(matches.size === 0);
  };

  pills.addEventListener('change', (e) => {
    e.stopPropagation();
    if (getQuery()) {
      field.value = '';
      search('');
    }
    showCategory(e.detail?.value ?? pills.value);
  });

  field.addEventListener('input', () => {
    pills.value = ALL;
    applySearch();
  });

  document.addEventListener('nx-cards-ready', () => {
    if (el.isConnected && getQuery()) applySearch();
  });

  // Blocks may remove their own section later (e.g. site-apps without apps).
  const container = el.closest('.section')?.parentElement;
  if (container) {
    new MutationObserver(() => {
      setItems();
      if (!pills.items.some((item) => item.value === pills.value)) {
        pills.value = ALL;
        showCategory(ALL);
      }
    }).observe(container, { childList: true });
  }
}

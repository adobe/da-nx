export const loadPlaceholders = (() => {
  const cache = {};

  const fetchPlaceholders = async (lang) => {
    const placeholders = new Map();
    const resp = await fetch(`/${lang}/placeholders.json`);
    if (resp.ok) {
      const { data } = await resp.json();
      for (const row of data) {
        placeholders.set(row.key, row.value);
      }
    }
    return placeholders;
  };

  return (lang) => {
    if (!lang) return new Map();
    cache[lang] ??= fetchPlaceholders(lang);
    return cache[lang];
  };
})();

import loadQuickEdit, { claimBootstrap } from './quick-edit.js';

export function prepare(body, search) {
  const params = new URLSearchParams(search);
  if (!params.has('quick-edit')) return null;

  claimBootstrap();
  body.classList.add('quick-edit');

  const parsed = (() => {
    try {
      const q = params.get('quick-edit');
      return q && q !== 'on' ? JSON.parse(decodeURIComponent(q)) : {};
    } catch {
      return {};
    }
  })();
  const detail = parsed?.detail ?? parsed;
  const payload = detail && typeof detail === 'object' ? detail : {};
  return { ...payload };
}

// Reuse same-origin scripts from the real head (document.head can be clobbered) to avoid reruns.
export function getUtilHrefs({ doc, origin }) {
  const urls = [...doc.querySelectorAll('head > script[src]')]
    .filter(({ src }) => URL.canParse(src))
    .map(({ src }) => new URL(src))
    .filter((url) => url.origin === origin);
  const find = (filename) => urls.find(({ pathname }) => pathname.endsWith(`/${filename}`))?.href;
  const scriptsHref = find('scripts.js') ?? `${origin}/scripts/scripts.js`;
  const aemHref = find('aem.js') ?? new URL('aem.js', scriptsHref).href;
  return { aemHref, scriptsHref };
}

async function loadUtilFunctions() {
  const { aemHref, scriptsHref } = getUtilHrefs({ doc: document, origin: location.origin });
  const aemPromise = import(aemHref);
  const scriptsPromise = import(scriptsHref);
  return {
    ...await aemPromise.catch((e) => {
      // eslint-disable-next-line no-console
      console.info('Failed to load aem.js', e);
      return {};
    }),
    ...await scriptsPromise.catch((e) => {
      // eslint-disable-next-line no-console
      console.info('Failed to load scripts.js', e);
      return {};
    }),
  };
}

const asFunction = (fn) => (typeof fn === 'function' ? fn : undefined);

// The page hook replaces both decoration and loading.
export function getReloadEditable({ reloadEditable, decorateMain, loadSections }) {
  if (asFunction(reloadEditable)) return reloadEditable;
  if (!asFunction(decorateMain) || !asFunction(loadSections)) return undefined;
  return async (main) => {
    await decorateMain(main);
    await loadSections(main);
  };
}

// Decorating an already-decorated main re-wraps its children, which turns the
// existing `*-wrapper` divs into blocks, so content is decorated in a fresh,
// detached `main` (the same pattern the EDS boilerplate uses in fragment.js).
// A section goes straight into `main`; anything else gets its own section.
export function prepareDetached(el, { isSection = false } = {}) {
  const main = document.createElement('main');
  if (isSection) {
    main.append(el);
    return main;
  }
  const section = document.createElement('div');
  section.append(el);
  main.append(section);
  return main;
}

export function createReload(reloadEditable) {
  return async (doc, { type, el } = {}) => {
    if (type) {
      if (!el) return undefined;
      // Inline elements are decorated detached; the caller swaps the result in.
      if (type === 'element') {
        const main = prepareDetached(el);
        await reloadEditable(main);
        return main.querySelector('[data-prose-index]') ?? el;
      }
      if (type === 'block') {
        const wrapper = el.parentElement;
        el.remove();
        const main = prepareDetached(el);
        await reloadEditable(main);
        // Read the result from the section; the reload may have replaced the block node itself.
        wrapper.replaceWith(...(main.firstElementChild?.children ?? []));
        return undefined;
      }
      const anchor = document.createComment('quick-edit');
      el.replaceWith(anchor);
      const main = prepareDetached(el, { isSection: true });
      await reloadEditable(main);
      anchor.replaceWith(...main.children);
      return undefined;
    }
    const main = doc.body.querySelector('main');
    if (main) await reloadEditable(main);
    return undefined;
  };
}

(async () => {
  const payload = prepare(document.body, window.location.search);
  if (!payload) return;

  const utils = await loadUtilFunctions();

  const reloadEditable = getReloadEditable(utils);
  if (reloadEditable) {
    loadQuickEdit(payload, createReload(reloadEditable), {
      bootstrap: true, partialReload: true,
    });
    return;
  }

  // Without a reload pipeline, fall back to loadPage, or show edits undecorated.
  const { loadPage } = utils;
  if (asFunction(loadPage)) {
    // eslint-disable-next-line no-console
    console.warn('[quick-edit] reloadEditable or decorateMain/loadSections not found, falling back to loadPage with full body - including header/footer - reloading.');
    loadQuickEdit(payload, () => loadPage(), { bootstrap: true });
  } else {
    // eslint-disable-next-line no-console
    console.warn('[quick-edit] reloadEditable or decorateMain/loadSections not found, edits will not be decorated.');
    loadQuickEdit(payload, () => {}, { bootstrap: true, partialReload: true });
  }
})();

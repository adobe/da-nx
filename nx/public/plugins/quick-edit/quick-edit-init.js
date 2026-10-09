import loadQuickEdit, { claimBootstrap } from './quick-edit.js';

export function getBootstrapPayload(search) {
  const parsed = (() => {
    try {
      const q = new URLSearchParams(search).get('quick-edit');
      return q && q !== 'on' ? JSON.parse(decodeURIComponent(q)) : {};
    } catch {
      return {};
    }
  })();
  const detail = parsed?.detail ?? parsed;
  const payload = detail && typeof detail === 'object' ? detail : {};
  return { ...payload };
}

(async () => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('quick-edit')) return;
  claimBootstrap();

  document.body.classList.add('quick-edit');

  const payload = getBootstrapPayload(window.location.search);

  const aemPromise = import(`${location.origin}/scripts/aem.js`);
  const scriptsPromise = import(`${location.origin}/scripts/scripts.js`);
  const utils = {
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
  const { decorateMain, loadSections, loadPage } = utils;
  const canDecorate = typeof decorateMain === 'function' && typeof loadSections === 'function';
  if (!canDecorate) {
    const hasLoadPage = typeof loadPage === 'function';
    // eslint-disable-next-line no-console
    console.warn(`[quick-edit] decorateMain/loadSections not found, ${hasLoadPage ? 'falling back to loadPage' : 'edits will not be decorated'}`);
    if (hasLoadPage) {
      // loadPage decorates header and footer again, so it needs the whole body replaced.
      loadQuickEdit(payload, () => loadPage(), { bootstrap: true });
    } else {
      loadQuickEdit(payload, () => {}, { bootstrap: true, partialReload: true });
    }
    return;
  }

  const decorate = async (main) => {
    decorateMain(main);
    await loadSections(main);
  };

  // Decorating an already-decorated main re-wraps its children, which turns the
  // existing `*-wrapper` divs into blocks. Detached decoration is the same
  // pattern the EDS boilerplate uses in fragment.js.
  const decorateDetached = async (section) => {
    const main = document.createElement('main');
    main.append(section);
    await decorate(main);
    return main;
  };

  const decorateReplaced = async ({ type, el }) => {
    if (!el) return;
    if (type === 'block') {
      const wrapper = el.parentElement;
      const section = document.createElement('div');
      section.append(el);
      await decorateDetached(section);
      wrapper.replaceWith(el.parentElement);
      return;
    }
    const anchor = document.createComment('quick-edit');
    el.replaceWith(anchor);
    const main = await decorateDetached(el);
    anchor.replaceWith(...main.children);
  };

  const reload = async (doc, replaced) => {
    if (replaced) {
      await decorateReplaced(replaced);
      return;
    }
    const main = doc.body.querySelector('main');
    if (main) await decorate(main);
  };

  loadQuickEdit(payload, reload, { bootstrap: true, partialReload: true });
})();

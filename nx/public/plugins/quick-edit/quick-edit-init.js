import loadQuickEdit from './quick-edit.js';

loadQuickEdit('INITIALIZING');

(async () => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('quick-edit')) return;

  document.body.classList.add('quick-edit');

  const defaultPayload = { reloadScope: 'main' };
  const payload = (() => {
    try {
      const q = params.get('quick-edit');
      return q && q !== 'on' ? JSON.parse(decodeURIComponent(q)) : defaultPayload;
    } catch {
      return defaultPayload;
    }
  })();

  const aemPromise = import(`${location.origin}/scripts/aem.js`);
  const scriptsPromise = import(`${location.origin}/scripts/scripts.js`);
  const utils = {
    ...await aemPromise.catch((e) => {
      console.info('Failed to load aem.js', e);
      return {};
    }),
    ...await scriptsPromise.catch((e) => {
      console.info('Failed to load scripts.js', e);
      return {};
    }),
  };

  // Decorating an already-decorated main re-wraps its children, which turns the
  // existing `*-wrapper` divs into blocks. Detached decoration is the same
  // pattern the EDS boilerplate uses in fragment.js.
  const decorateDetached = async (section) => {
    const main = document.createElement('main');
    main.append(section);
    utils.decorateMain(main);
    await utils.loadSections(main);
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

  const buildReloadCallback = () => {
    if (utils.decorateMain && utils.loadSections) {
      return (replaced) => {
        if (replaced) return decorateReplaced(replaced);
        const main = document.body.querySelector('main');
        utils.decorateMain(main);
        return utils.loadSections(main);
      };
    }
    if (utils.loadPage) {
      return () => utils.loadPage();
    }
    console.warn('No suitable reload method found, falling back to location.reload()');
    return () => location.reload();
  };

  loadQuickEdit(payload, buildReloadCallback());
})();

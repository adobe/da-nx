import { expect } from '@esm-bundle/chai';
import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import '../../../../nx2/blocks/ew-actions/ew-actions.js';

let seq = 0;
// Unique org/site per test avoids collisions with daConfig.js's module-level fetch cache.
function uniq(prefix) {
  seq += 1;
  return `${prefix}${Date.now()}${seq}`;
}

function installFetch(responsesByUrlSubstring) {
  const origFetch = window.fetch;
  // Sort longest-key-first: the org-level config URL is a substring of the
  // site-level one, so a naive first-match would always serve the org config.
  const entries = Object.entries(responsesByUrlSubstring).sort(([a], [b]) => b.length - a.length);
  window.fetch = async (url, opts) => {
    const match = entries.find(([key]) => url.includes(key));
    if (match) return new Response(JSON.stringify(match[1]), { status: 200 });
    return origFetch(url, opts);
  };
  return () => { window.fetch = origFetch; };
}

async function makeEl() {
  const el = document.createElement('nx-ew-actions');
  document.body.append(el);
  await el.updateComplete;
  return el;
}

describe('nx-ew-actions', () => {
  let el;
  let restoreFetch;

  afterEach(() => {
    el?.remove();
    restoreFetch?.();
  });

  describe('_filterHidePublish', () => {
    it('does not hide publish when there is no open document', async () => {
      el = await makeEl();
      el._hashState = null;
      await el._filterHidePublish();
      expect(el._hidePublish).to.be.false;
    });

    it('hides publish when a matching editor.hidePublish config exists', async () => {
      const org = uniq('org');
      const site = uniq('site');
      restoreFetch = installFetch({
        [`${DA_ADMIN}/config/${org}/`]: { data: [{ key: 'editor.hidePublish', value: `/${org}/${site}/test` }] },
        [`${DA_ADMIN}/config/${org}/${site}/`]: { data: [] },
      });

      el = await makeEl();
      el._hashState = { org, site, path: '/test/page' };
      await el._filterHidePublish();

      expect(el._hidePublish).to.be.true;
    });

    it('keeps publish when the editor.hidePublish config does not match the path', async () => {
      const org = uniq('org');
      const site = uniq('site');
      restoreFetch = installFetch({
        [`${DA_ADMIN}/config/${org}/`]: { data: [{ key: 'editor.hidePublish', value: `/${org}/${site}/other` }] },
        [`${DA_ADMIN}/config/${org}/${site}/`]: { data: [] },
      });

      el = await makeEl();
      el._hashState = { org, site, path: '/test/page' };
      await el._filterHidePublish();

      expect(el._hidePublish).to.be.false;
    });

    it('ORs editor.hidePublish rows across org- and site-level configs', async () => {
      const org = uniq('org');
      const site = uniq('site');
      restoreFetch = installFetch({
        [`${DA_ADMIN}/config/${org}/`]: { data: [{ key: 'editor.hidePublish', value: `/${org}/${site}/other` }] },
        [`${DA_ADMIN}/config/${org}/${site}/`]: { data: [{ key: 'editor.hidePublish', value: `/${org}/${site}/test` }] },
      });

      el = await makeEl();
      el._hashState = { org, site, path: '/test/page' };
      await el._filterHidePublish();

      expect(el._hidePublish).to.be.true;
    });

    it('hides publish when editor.hidePublish lives in a non-first multi-sheet tab named "data"', async () => {
      const org = uniq('org');
      const site = uniq('site');
      restoreFetch = installFetch({
        [`${DA_ADMIN}/config/${org}/`]: {
          permissions: { data: [{ path: '/', groups: 'everyone', actions: 'write' }] },
          data: { data: [{ key: 'editor.hidePublish', value: `/${org}/${site}/test` }] },
          ':names': ['permissions', 'data'],
          ':type': 'multi-sheet',
        },
        [`${DA_ADMIN}/config/${org}/${site}/`]: { data: [] },
      });

      el = await makeEl();
      el._hashState = { org, site, path: '/test/page' };
      await el._filterHidePublish();

      expect(el._hidePublish).to.be.true;
    });
  });

  describe('render', () => {
    it('includes both preview and publish menu items when publish is not hidden', async () => {
      const org = uniq('org');
      const site = uniq('site');
      restoreFetch = installFetch({
        [`${DA_ADMIN}/config/${org}/`]: { data: [] },
        [`${DA_ADMIN}/config/${org}/${site}/`]: { data: [] },
      });

      el = await makeEl();
      el._hashState = { org, site, path: '/test/page' };
      await el._filterHidePublish();
      await el.updateComplete;

      const ids = el.shadowRoot.querySelector('nx-menu').items.map((i) => i.id);
      expect(ids).to.include.members(['preview', 'publish']);
    });

    it('omits the publish menu item (keeps preview) when publish is hidden', async () => {
      const org = uniq('org');
      const site = uniq('site');
      restoreFetch = installFetch({
        [`${DA_ADMIN}/config/${org}/`]: { data: [{ key: 'editor.hidePublish', value: `/${org}/${site}/test` }] },
        [`${DA_ADMIN}/config/${org}/${site}/`]: { data: [] },
      });

      el = await makeEl();
      el._hashState = { org, site, path: '/test/page' };
      await el._filterHidePublish();
      await el.updateComplete;

      const ids = el.shadowRoot.querySelector('nx-menu').items.map((i) => i.id);
      expect(ids).to.include('preview');
      expect(ids).to.not.include('publish');
    });
  });
});

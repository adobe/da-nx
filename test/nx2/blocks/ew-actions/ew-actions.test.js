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

  describe('_updateHidePublish', () => {
    it('does not hide publish when there is no open document', async () => {
      el = await makeEl();
      el._hashState = null;
      await el._updateHidePublish();
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
      await el._updateHidePublish();

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
      await el._updateHidePublish();

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
      await el._updateHidePublish();

      expect(el._hidePublish).to.be.true;
    });
  });

  describe('render', () => {
    const cardTitles = (element) => [...element.shadowRoot.querySelectorAll('.deploy-card-title')]
      .map((n) => n.textContent.trim());

    describe('UI sizing', () => {
      let originalSize;

      beforeEach(() => {
        originalSize = localStorage.getItem('ui-size');
      });

      afterEach(() => {
        if (originalSize === null) localStorage.removeItem('ui-size');
        else localStorage.setItem('ui-size', originalSize);
      });

      it('uses small buttons only for small sizing, including the default', async () => {
        const org = uniq('org');
        const site = uniq('site');
        restoreFetch = installFetch({
          [`${DA_ADMIN}/config/${org}/`]: { data: [] },
          [`${DA_ADMIN}/config/${org}/${site}/`]: { data: [] },
        });
        el = await makeEl();
        el._hashState = { org, site, path: '/test/page' };
        el._prepareReady = true;
        el._busy = true;
        el._hasError = true;
        el._target = 'live';

        for (const size of [null, 's', 'm', 'l', 's']) {
          if (size === null) localStorage.removeItem('ui-size');
          else localStorage.setItem('ui-size', size);
          el.requestUpdate();
          await el.updateComplete;
          const buttons = [...el.shadowRoot.querySelectorAll(
            '.prepare-dropdown-btn, .send-btn, .deploy-action',
          )];
          expect(buttons.length).to.equal(3);
          buttons.forEach((button) => {
            expect(button.classList.contains('nx-btn-sm')).to.equal(size === null || size === 's');
          });
          const send = el.shadowRoot.querySelector('.send-btn');
          expect(send.classList.contains('is-error')).to.be.true;
          expect(send.classList.contains('is-busy')).to.be.true;
          expect(send.disabled).to.be.true;
          const deploy = el.shadowRoot.querySelector('.deploy-action');
          expect(deploy.classList.contains('is-publish')).to.be.true;
          expect(deploy.disabled).to.be.true;
        }
      });
    });

    it('shows both Preview and Publish cards when publish is not hidden', async () => {
      const org = uniq('org');
      const site = uniq('site');
      restoreFetch = installFetch({
        [`${DA_ADMIN}/config/${org}/`]: { data: [] },
        [`${DA_ADMIN}/config/${org}/${site}/`]: { data: [] },
      });

      el = await makeEl();
      el._hashState = { org, site, path: '/test/page' };
      await el._updateHidePublish();
      await el.updateComplete;

      expect(cardTitles(el)).to.deep.equal(['Preview', 'Preview & Publish']);
    });

    it('omits the Publish card (keeps Preview) when publish is hidden', async () => {
      const org = uniq('org');
      const site = uniq('site');
      restoreFetch = installFetch({
        [`${DA_ADMIN}/config/${org}/`]: { data: [{ key: 'editor.hidePublish', value: `/${org}/${site}/test` }] },
        [`${DA_ADMIN}/config/${org}/${site}/`]: { data: [] },
      });

      el = await makeEl();
      el._hashState = { org, site, path: '/test/page' };
      await el._updateHidePublish();
      await el.updateComplete;

      expect(cardTitles(el)).to.deep.equal(['Preview']);
      expect(el.shadowRoot.querySelector('.deploy-card-live')).to.equal(null);
    });
  });
});

import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { versions, aem } from '../../../../nx2/utils/api.js';
import { VERSION_EVENT } from '../../../../nx2/utils/version-events.js';
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
    if (url.includes('/ping/')) return new Response('', { status: 200 });
    if (url.startsWith(`${DA_ADMIN}/config/`)) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
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
    sinon.restore();
    document.getElementById('nx-toast-host')?.remove();
  });

  describe('version creation', () => {
    const path = '/org/site/page.html';

    it('notifies history only after the version is persisted', async () => {
      let finish;
      const create = sinon.stub(versions, 'create').returns(new Promise((resolve) => {
        finish = resolve;
      }));
      el = await makeEl();
      const notify = sinon.spy();
      el.addEventListener(VERSION_EVENT.CREATED, notify);
      const saving = el._saveVersion({ action: 'preview', path });
      expect(notify.called).to.be.false;
      finish(new Response('', { status: 201 }));
      await saving;
      expect(create.calledOnceWithExactly(path, { comment: 'Previewed' })).to.be.true;
      expect(notify.calledOnce).to.be.true;
      const event = notify.firstCall.args[0];
      expect(event.detail).to.deep.equal({ path });
      expect(event.bubbles).to.be.true;
      expect(event.composed).to.be.true;
    });

    it('records published versions with the same success notification', async () => {
      const create = sinon.stub(versions, 'create').resolves(new Response('', { status: 201 }));
      el = await makeEl();
      const notify = sinon.spy();
      el.addEventListener(VERSION_EVENT.CREATED, notify);
      await el._saveVersion({ action: 'publish', path });
      expect(create.calledOnceWithExactly(path, { comment: 'Published' })).to.be.true;
      expect(notify.calledOnce).to.be.true;
    });

    [500, 403].forEach((status) => {
      it(`does not notify on HTTP ${status} and distinguishes version failure from deploy success`, async () => {
        sinon.stub(versions, 'create').resolves(new Response('', { status }));
        el = await makeEl();
        const notify = sinon.spy();
        el.addEventListener(VERSION_EVENT.CREATED, notify);
        await el._saveVersion({ action: 'preview', path });
        expect(notify.called).to.be.false;
        const toast = document.querySelector('nx-toast');
        expect(toast.message).to.include('Page previewed, but its history version could not be saved.');
        expect(toast.variant).to.equal('warning');
        expect(el._hasError).to.not.be.true;
      });
    });

    it('reports network failure without emitting a success notification', async () => {
      sinon.stub(versions, 'create').rejects(new Error('network down'));
      el = await makeEl();
      const notify = sinon.spy();
      el.addEventListener(VERSION_EVENT.CREATED, notify);
      await el._saveVersion({ action: 'publish', path });
      expect(notify.called).to.be.false;
      expect(document.querySelector('nx-toast').message)
        .to.include('Page published, but its history version could not be saved.');
    });

    it('keeps the original document path when navigating during preview', async () => {
      restoreFetch = installFetch({ '/sidekick/': {} });
      sinon.stub(aem, 'preview').resolves(new Response(JSON.stringify({
        preview: { url: 'https://example.com/page' },
      }), { status: 200 }));
      sinon.stub(window, 'open');
      el = await makeEl();
      el._hashState = { org: 'org', site: 'site', path: 'page' };
      const editor = document.createElement('ew-editor-doc');
      editor.forceSave = async () => {
        el._hashState = { org: 'org', site: 'site', path: 'other' };
        return { ok: true };
      };
      document.body.append(editor);
      const save = sinon.stub(el, '_saveVersion').resolves();
      try {
        await el._runAemAction('preview');
        expect(save.calledOnceWithExactly({ action: 'preview', path })).to.be.true;
      } finally {
        editor.remove();
      }
    });
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

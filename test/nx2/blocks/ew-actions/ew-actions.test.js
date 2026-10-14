import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { versions, aem } from '../../../../nx2/utils/api.js';
import { VERSION_EVENT } from '../../../../nx2/utils/version-events.js';
import { BRANCH_EVENT } from '../../../../nx2/utils/branch-events.js';
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
  let branchState;
  const reportBranch = (detail) => document.dispatchEvent(new CustomEvent(BRANCH_EVENT.STATE, {
    detail,
  }));
  const onBranchRequest = ({ detail }) => {
    if (branchState) reportBranch({ ...detail, ...branchState });
  };

  beforeEach(() => {
    branchState = { status: 'ready', branch: 'main' };
    document.addEventListener(BRANCH_EVENT.REQUEST, onBranchRequest);
  });

  afterEach(() => {
    el?.remove();
    restoreFetch?.();
    sinon.restore();
    document.removeEventListener(BRANCH_EVENT.REQUEST, onBranchRequest);
  });

  describe('canvas branch state', () => {
    const state = { org: 'Org', site: 'Site', path: 'Docs/Page' };
    const path = '/Org/Site/Docs/Page';

    beforeEach(() => { restoreFetch = installFetch({}); });

    it('uses replayed state for branch URLs and preserves the canvas context path', async () => {
      branchState = { status: 'ready', branch: 'Feat/My_Branch' };
      el = await makeEl();
      el._hashState = state;
      await el.updateComplete;
      await el._branchPromise;
      expect(el._branchPath).to.equal(path);
      el._status = {
        webPath: '/docs/page',
        preview: { status: 200, url: 'https://custom.example/docs/page' },
        live: { status: 200, url: 'https://live.example/docs/page' },
      };
      expect(el._previewInfo.url).to.equal('https://feat-my-branch--site--org.aem.page/docs/page');
      expect(el._liveInfo.url).to.equal('https://feat-my-branch--site--org.aem.live/docs/page');
    });

    it('hides unknown URLs, ignores stale state, and accepts later ready state', async () => {
      branchState = null;
      el = await makeEl();
      el._hashState = state;
      await el.updateComplete;
      el._status = { webPath: '/docs/page', preview: { status: 200, url: 'https://main.example/page' } };
      expect(el._previewInfo.url).to.be.null;
      reportBranch({ path: '/other/site/page', status: 'ready', branch: 'wrong' });
      expect(el._branch).to.equal(undefined);
      reportBranch({ path, status: 'ready', branch: 'right' });
      expect(el._previewInfo.url).to.equal('https://right--site--org.aem.page/docs/page');
      reportBranch({ path, status: 'pending' });
      expect(el._previewInfo.url).to.be.null;
      reportBranch({ path, status: 'ready', branch: 'main' });
      expect(el._previewInfo.url).to.equal('https://main.example/page');
    });

    it('cancels navigation requests and stops listening when disconnected', async () => {
      branchState = null;
      el = await makeEl();
      el._hashState = state;
      await el.updateComplete;
      const stale = el._branchPromise.catch((error) => error);
      el._hashState = { ...state, path: 'Other' };
      await el.updateComplete;
      expect((await stale).name).to.equal('AbortError');
      reportBranch({ path, status: 'ready', branch: 'stale' });
      expect(el._branch).to.equal(undefined);
      const current = el._branchPromise.catch((error) => error);
      el.remove();
      expect((await current).name).to.equal('AbortError');
      reportBranch({ path: '/Org/Site/Other', status: 'ready', branch: 'disconnected' });
      expect(el._branch).to.equal(undefined);
    });

    it('fails closed if the host bridge never answers, then recovers from later state', async () => {
      branchState = null;
      const clock = sinon.useFakeTimers();
      const preview = sinon.spy(aem, 'preview');
      el = await makeEl();
      const showError = sinon.stub(el, '_showActionError').resolves();
      el._hashState = state;
      await el.updateComplete;
      const deploying = el._runAemAction('preview');
      await clock.tickAsync(3000);
      await deploying;
      expect(preview.called).to.be.false;
      expect(showError.calledOnce).to.be.true;
      reportBranch({ path, status: 'ready', branch: 'recovered' });
      expect(await el._branchPromise).to.equal('recovered');
    });

    ['preview', 'publish'].forEach((action) => {
      it(`opens the original canvas branch after ${action}, even if navigation occurs during save`, async () => {
        branchState = { status: 'ready', branch: 'original-branch' };
        const body = {
          webPath: '/docs/page',
          preview: { url: 'https://main.example/docs/page' },
          live: { url: 'https://live.example/docs/page' },
        };
        const preview = sinon.stub(aem, 'preview').callsFake(async () => new Response(JSON.stringify(body)));
        const publish = sinon.stub(aem, 'publish').callsFake(async () => new Response(JSON.stringify(body)));
        const open = sinon.stub(window, 'open');
        el = await makeEl();
        sinon.stub(el, '_saveVersion').resolves();
        el._hashState = state;
        await el.updateComplete;
        const editor = document.createElement('ew-editor-doc');
        editor.forceSave = async () => {
          branchState = { status: 'ready', branch: 'new-branch' };
          el._hashState = { ...state, path: 'New' };
          await el.updateComplete;
          await el._branchPromise;
          return { ok: true };
        };
        document.body.append(editor);
        try {
          await el._runAemAction(action);
          const tld = action === 'publish' ? 'live' : 'page';
          const href = `https://original-branch--site--org.aem.${tld}/docs/page`;
          expect(open.calledOnceWithExactly(href, href)).to.be.true;
          expect(preview.calledOnceWithExactly('/org/site/docs/page')).to.be.true;
          expect(publish.called).to.equal(action === 'publish');
          expect(el._branch).to.equal('new-branch');
        } finally {
          editor.remove();
        }
      });
    });
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
      it(`logs HTTP ${status} without showing an alert or notifying history`, async () => {
        sinon.stub(versions, 'create').resolves(new Response('', { status }));
        el = await makeEl();
        const warn = sinon.stub(console, 'warn');
        const notify = sinon.spy();
        el.addEventListener(VERSION_EVENT.CREATED, notify);
        await el._saveVersion({ action: 'preview', path });
        expect(notify.called).to.be.false;
        expect(warn.calledOnce).to.be.true;
        expect(warn.firstCall.args[0]).to.equal('Error creating auto version (Previewed).');
        expect(warn.firstCall.args[1].message).to.equal(`Version creation failed (${status}).`);
        expect(document.querySelector('nx-toast')).to.be.null;
        expect(el._hasError).to.not.be.true;
      });
    });

    it('logs network failure without showing an alert or emitting a success notification', async () => {
      const error = new Error('network down');
      sinon.stub(versions, 'create').rejects(error);
      el = await makeEl();
      const warn = sinon.stub(console, 'warn');
      const notify = sinon.spy();
      el.addEventListener(VERSION_EVENT.CREATED, notify);
      await el._saveVersion({ action: 'publish', path });
      expect(notify.called).to.be.false;
      expect(warn.calledOnceWithExactly('Error creating auto version (Published).', error)).to.be.true;
      expect(document.querySelector('nx-toast')).to.be.null;
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

import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../../scripts/nx.js';
import { addExistingSite } from '../../../../../blocks/siteselector/site-utils.js';

await setConfig({ hostnames: [] });
await import('../../../../../blocks/siteselector/siteselector.js');
const { source, config } = await import('../../../../../utils/api.js');
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('site selector history and lifecycle', () => {
  let selector;
  let connection;
  let list;
  let href;
  let recentSites;
  const choose = (value) => selector.onChange({ stopPropagation() {}, detail: { value } });

  async function openDialog() {
    await selector.showAddSite();
    const dialog = document.querySelector('nx-add-site');
    await dialog.updateComplete;
    await dialog.shadowRoot.querySelector('nx-dialog').updateComplete;
    return dialog;
  }

  beforeEach(async () => {
    href = window.location.href;
    recentSites = localStorage.getItem('da-sites');
    window.history.replaceState(null, '', '#/aemsites/devlive/folder');
    localStorage.setItem('da-sites', '["aemsites/devlive","exp-workspace/frescopaco"]');
    list = sinon.stub(source, 'list').resolves({ ok: true, items: [] });
    sinon.stub(config, 'get').resolves(new Response('{}', { headers: { 'x-da-actions': '/=read' } }));
    selector = document.createElement('nx-siteselector');
    const refresh = sinon.spy(selector, 'refresh');
    document.body.append(selector);
    connection = selector._connection;
    await refresh.firstCall.returnValue;
    refresh.restore();
    await selector.updateComplete;
  });

  afterEach(() => {
    selector.remove();
    window.history.replaceState(null, '', href);
    if (recentSites === null) localStorage.removeItem('da-sites');
    else localStorage.setItem('da-sites', recentSites);
    sinon.restore();
  });

  it('defaults DA selectors to S without replacing an explicit M size', async () => {
    expect(selector.size).to.equal('s');
    selector.size = 'm';
    selector.remove();
    document.body.append(selector);
    await tick();
    expect(selector.size).to.equal('m');
  });

  it('keeps selection independent of folder changes without repeating access checks', async () => {
    expect(selector.value).to.equal('aemsites/devlive');
    list.resetHistory();
    window.history.replaceState(null, '', '#/aemsites/devlive/other');
    await selector.refresh();
    expect(selector.value).to.equal('aemsites/devlive');
    expect(list.called).to.be.false;
  });

  it('leaves an unscoped host unselected, selects explicitly and preserves its heading on reset', async () => {
    const remembered = localStorage.getItem('da-sites');
    selector.heading = 'Your recent sites';
    window.history.replaceState(null, '', window.location.pathname);
    await selector.refresh();
    expect(selector.value).to.equal('');
    expect(selector.heading).to.equal('Your recent sites');
    expect(selector.sites).to.have.length(2);
    expect(selector.sites.map(({ value }) => value)).to.include('exp-workspace/frescopaco');
    expect(localStorage.getItem('da-sites')).to.equal(remembered);
    const value = 'exp-workspace/frescopaco';
    const unscopedHref = window.location.href;
    choose(value);
    await tick();
    expect(window.location.href).to.equal(unscopedHref);
    expect(selector.value).to.equal(value);
    expect(selector.sites.find((site) => site.value === value).label).to.equal(value);
    window.history.replaceState(null, '', '#/aemsites/devlive');
    await selector.refresh();
    window.history.replaceState(null, '', window.location.pathname);
    await selector.refresh();
    expect(selector.value).to.equal('');
    expect(selector.heading).to.equal('Your recent sites');
    expect(selector.sites.map((site) => site.value)).to.have.members(['aemsites/devlive', value]);
    localStorage.setItem('da-sites', '[]');
    await selector.refresh();
    expect(selector.value).to.equal('');
    expect(selector.sites).to.deep.equal([]);
  });

  it('hides denied choices without deleting history or changing a denied current route', async () => {
    list.resolves({ ok: false });
    sinon.stub(source, 'getMetadata').resolves(new Response(null, { status: 403 }));
    localStorage.setItem('da-sites', '["exp-workspace/frescopaco"]');
    await selector.onRetry();
    expect(selector.sites).to.deep.equal([]);
    expect(JSON.parse(localStorage.getItem('da-sites')))
      .to.deep.equal(['aemsites/devlive', 'exp-workspace/frescopaco']);
    expect(window.location.hash).to.equal('#/aemsites/devlive/folder');
    expect(selector.value).to.equal('aemsites/devlive');
    expect(selector.error).to.include('You do not have access to aemsites/devlive');
  });

  it('hides denied Devlive after selecting Frescopaco but keeps both in saved history', async () => {
    list.callsFake(async (path) => ({
      ok: path.startsWith('/exp-workspace'),
      items: path === '/exp-workspace' ? [{ name: 'frescopaco' }] : [],
    }));
    sinon.stub(source, 'getMetadata').resolves(new Response(null, { status: 403 }));
    const value = 'exp-workspace/frescopaco';
    await addExistingSite({ value, source, signal: connection.signal });
    await choose(value);
    expect(selector.value).to.equal(value);
    expect(selector.sites.map((site) => site.value)).to.deep.equal([value]);
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal([value, 'aemsites/devlive']);
    expect(selector.error).to.equal(undefined);
    choose('aemsites/devlive');
    expect(window.location.hash).to.equal('#/aemsites/devlive/folder');
    expect(selector.error).to.include('no longer available');
  });

  it('keeps known denials hidden while retrying and restores choices when access returns', async () => {
    list.callsFake(async (path) => ({ ok: path.includes('aemsites') }));
    sinon.stub(source, 'getMetadata').resolves(new Response(null, { status: 403 }));
    await selector.onRetry();
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['aemsites/devlive']);
    const saved = localStorage.getItem('da-sites');
    let finish;
    const started = new Promise((resolveStarted) => {
      list.callsFake((path) => (path.includes('aemsites')
        ? Promise.resolve({ ok: true }) : new Promise((resolve) => {
          finish = resolve;
          resolveStarted();
        })));
    });
    localStorage.setItem('da-sites', '["exp-workspace/frescopaco"]');
    const refreshed = selector.onRetry();
    await started;
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['aemsites/devlive']);
    list.resolves({ ok: true });
    finish({ ok: true });
    await refreshed;
    expect(selector.sites.map(({ value }) => value))
      .to.deep.equal(['aemsites/devlive', 'exp-workspace/frescopaco']);
    expect(localStorage.getItem('da-sites')).to.equal(saved);
  });

  it('does not apply an old denial after the route changes', async () => {
    let finish;
    list.resetHistory();
    const started = new Promise((resolveStarted) => {
      list.onFirstCall().callsFake(() => new Promise((resolve) => {
        finish = resolve;
        resolveStarted();
      }));
    });
    const refreshed = selector.onRetry();
    await started;
    const checking = list.firstCall.args[1].opts.signal;
    window.history.replaceState(null, '', '#/other/site');
    await selector.refresh();
    expect(checking.aborted).to.equal(true);
    finish({ ok: false });
    await refreshed;
    expect(selector.value).to.equal('other/site');
    expect(selector.sites.map(({ value }) => value))
      .to.deep.equal(['other/site', 'aemsites/devlive', 'exp-workspace/frescopaco']);
    expect(selector.error).to.equal(undefined);
  });

  it('rejects unknown selection without changing the route', () => {
    const { hash } = window.location;
    choose('unknown/site');
    expect(window.location.hash).to.equal(hash);
    expect(selector.error).to.include('no longer available');
  });

  it('refreshes cross-tab history without deleting remembered sites', async () => {
    localStorage.setItem('da-sites', '["other/site"]');
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-sites' }));
    await selector.refresh();
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['aemsites/devlive', 'other/site']);
  });

  it('reports corrupt history without overwriting it and recovers after repair', async () => {
    for (const invalid of ['[', '{}']) {
      localStorage.setItem('da-sites', invalid);
      await selector.refresh();
      expect(selector.error).to.include('Could not read recent sites');
      expect(selector.value).to.equal('aemsites/devlive');
      expect(localStorage.getItem('da-sites')).to.equal(invalid);
    }
    localStorage.setItem('da-sites', '[]');
    await selector.refresh();
    expect(selector.error).to.be.undefined;
  });

  it('reports unavailable storage and failed access verification explicitly', async () => {
    const save = sinon.stub(Storage.prototype, 'setItem').throws(new Error('Storage unavailable'));
    window.history.replaceState(null, '', '#/other/site');
    await selector.refresh();
    expect(selector.error).to.include('Could not save the current site');
    save.restore();
    list.rejects(new Error('Offline'));
    await selector.refresh();
    expect(selector.error).to.include('Offline');
  });

  it('opens one lazy Add dialog without navigating and restores trigger focus on cancel', async () => {
    const focus = sinon.spy(selector, 'focus');
    const opening = sinon.spy(selector, 'showAddSite');
    const { hash } = window.location;
    document.dispatchEvent(new CustomEvent('site-add'));
    document.dispatchEvent(new CustomEvent('site-add'));
    await opening.firstCall.returnValue;
    const dialogs = document.querySelectorAll('nx-add-site');
    expect(dialogs).to.have.length(1);
    const [dialog] = dialogs;
    await dialog.updateComplete;
    await dialog.shadowRoot.querySelector('nx-dialog').updateComplete;
    expect(dialog.org).to.equal('aemsites');
    expect(dialog.shadowRoot.querySelector('.site-creation')).to.be.null;
    expect(window.location.hash).to.equal(hash);
    dialog.dispatchEvent(new Event('close'));
    expect(dialog.isConnected).to.be.false;
    expect(focus.calledOnce).to.be.true;
  });

  it('retries an uncertain access failure even when history and route are unchanged', async () => {
    const history = sinon.stub(Storage.prototype, 'getItem').callThrough();
    history.withArgs('da-sites').returns('["aemsites/devlive","other/site"]');
    const save = sinon.stub(Storage.prototype, 'setItem').callThrough();
    save.withArgs('da-sites').returns();
    list.rejects(new Error('Offline'));
    await selector.refresh();
    expect(selector.error).to.include('Offline');
    list.resolves({ ok: true, items: [] });
    selector.onRetry();
    await tick();
    expect(selector.error).to.be.undefined;
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['aemsites/devlive', 'other/site']);
  });

  it('closes Add on route changes without replacing the host heading', async () => {
    selector.heading = 'Choose a site';
    await openDialog();
    window.history.replaceState(null, '', '#/exp-workspace/frescopaco');
    await selector.refresh();
    expect(document.querySelector('nx-add-site')).to.be.null;
    expect(selector.heading).to.equal('Choose a site');
  });

  it('keeps selection and history without navigating or dispatching a hash change', async () => {
    window.history.replaceState(null, '', '?nx=siteselector-main&theme=dark#/aemsites/devlive');
    await selector.refresh();
    const currentHref = window.location.href;
    const hashchange = sinon.spy();
    window.addEventListener('hashchange', hashchange, { signal: connection.signal });
    const value = 'exp-workspace/frescopaco';
    choose(value);
    await tick();
    selector.onRetry();
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-sites' }));
    await tick();
    expect(window.location.href).to.equal(currentHref);
    expect(hashchange.called).to.be.false;
    expect(selector.value).to.equal(value);
    expect(JSON.parse(localStorage.getItem('da-sites'))[0]).to.equal(value);
  });

  it('selects an added site without navigating', async () => {
    const currentHref = window.location.href;
    const dialog = await openDialog();
    const value = 'other/site';
    dialog.dispatchEvent(new CustomEvent('site-added', { detail: { value } }));
    await tick();
    expect(dialog.isConnected).to.be.false;
    expect(window.location.href).to.equal(currentHref);
    expect(selector.value).to.equal(value);
    expect(JSON.parse(localStorage.getItem('da-sites'))[0]).to.equal(value);
  });

  it('notifies the host about both selected and added sites using one event', async () => {
    const onSelect = sinon.spy(({ value }) => { window.location.hash = `/${value}`; });
    selector.addEventListener('site-select', ({ detail }) => onSelect(detail), { signal: connection.signal });
    const { search } = window.location;
    await choose('exp-workspace/frescopaco');
    expect(window.location.hash).to.equal('#/exp-workspace/frescopaco');
    expect(selector.value).to.equal('exp-workspace/frescopaco');
    expect(onSelect.calledOnceWithExactly({ value: 'exp-workspace/frescopaco' })).to.be.true;
    const dialog = await openDialog();
    dialog.dispatchEvent(new CustomEvent('site-added', { detail: { value: 'other/site' } }));
    await tick();
    expect(window.location.hash).to.equal('#/other/site');
    expect(selector.value).to.equal('other/site');
    expect(window.location.search).to.equal(search);
    expect(onSelect.calledTwice).to.be.true;
    expect(onSelect.secondCall.args).to.deep.equal([{ value: 'other/site' }]);
    choose('unknown/site');
    expect(onSelect.calledTwice).to.be.true;
    expect(window.location.hash).to.equal('#/other/site');
  });

  it('aborts pending checks and removes all listeners and dialogs on disconnect', async () => {
    const started = new Promise((resolve) => {
      list.callsFake((path, { opts: { signal } }) => {
        resolve(signal);
        return new Promise(() => {});
      });
    });
    localStorage.setItem('da-sites', '["new/site"]');
    selector.refresh();
    const checking = await started;
    selector.remove();
    expect(checking.aborted).to.be.true;
    list.resetHistory();
    document.dispatchEvent(new CustomEvent('site-add'));
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-sites' }));
    window.dispatchEvent(new Event('hashchange'));
    await tick();
    expect(list.called).to.be.false;
    expect(document.querySelector('nx-add-site')).to.be.null;
  });
});

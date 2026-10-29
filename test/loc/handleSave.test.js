import { expect } from '@esm-bundle/chai';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import '../../nx/blocks/loc/loc.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('NxLoc handleSave', () => {
  let savedBody;

  beforeEach(() => {
    setImsDetails('test-token');
    window.location.hash = '#/translate/org/site';
    savedBody = null;

    window.fetch = async (input, opts = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/source/') && opts.method === 'POST') {
        const formData = await opts.body.formData?.() ?? opts.body;
        const data = formData.get('data');
        savedBody = JSON.parse(await data.text());
        return jsonResponse({});
      }
      return jsonResponse({});
    };
  });

  afterEach(() => {
    delete window.fetch;
  });

  it('merges urls by path when mergeUrls is set, and strips the flag before persisting', async () => {
    const el = document.createElement('nx-loc');
    el.path = '/project';
    el._project = {
      org: 'org',
      site: 'site',
      urls: [{ basePath: '/a.html', requestIds: { 'fr-FR': 'req-fr' } }],
    };

    await el.handleSave({
      detail: {
        data: {
          mergeUrls: true,
          urls: [{ basePath: '/a.html', requestIds: { 'de-DE': 'req-de' } }],
        },
      },
    });

    expect(savedBody.urls[0].requestIds).to.deep.equal({ 'fr-FR': 'req-fr', 'de-DE': 'req-de' });
    expect(savedBody.mergeUrls).to.equal(undefined);
  });

  it('does not replace the new project UI when an old project write finishes after navigation', async () => {
    const el = document.createElement('nx-loc');
    el.org = 'org';
    el.site = 'site';
    el.path = '/project';
    el._project = { org: 'org', site: 'site', title: 'Old project', urls: [] };
    let finishWrite;
    let started;
    let savedHref;
    const writing = new Promise((resolve) => { finishWrite = resolve; });
    const writeStarted = new Promise((resolve) => { started = resolve; });
    window.fetch = async (href, opts = {}) => {
      if (opts.method === 'POST') {
        savedHref = href.toString();
        started();
        await writing;
      }
      return jsonResponse({});
    };

    const saved = el.handleSave({
      detail: { path: '/org/site/project', data: { title: 'Old progress' } },
    });
    await writeStarted;
    el.path = '/different-project';
    const project = { org: 'org', site: 'site', title: 'New project', urls: [] };
    const message = { text: 'New project loaded' };
    el._project = project;
    el._message = message;
    window.location.hash = '#/translate/org/site/different-project';
    finishWrite();
    await saved;

    expect(savedHref).to.include('/project');
    expect(savedHref).not.to.include('/different-project');
    expect(el._project).to.equal(project);
    expect(el._message).to.equal(message);
    expect(window.location.hash).to.equal('#/translate/org/site/different-project');
  });

  it('replaces urls wholesale when mergeUrls is not set (validate/basics full-replace flows)', async () => {
    const el = document.createElement('nx-loc');
    el.path = '/project';
    el._project = {
      org: 'org',
      site: 'site',
      urls: [{ basePath: '/a.html', checked: true }, { basePath: '/b.html', checked: false }],
    };

    await el.handleSave({
      detail: { data: { urls: [{ basePath: '/a.html', checked: true }] } },
    });

    expect(savedBody.urls).to.deep.equal([{ basePath: '/a.html', checked: true }]);
  });

  it('serializes concurrent saves so a slower first save cannot overwrite a second save\'s merge', async () => {
    const el = document.createElement('nx-loc');
    el.path = '/project';
    el._project = {
      org: 'org',
      site: 'site',
      urls: [{ basePath: '/a.html', requestIds: {} }],
    };

    let callCount = 0;
    window.fetch = async (input, opts = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/source/') && opts.method === 'POST') {
        callCount += 1;
        const isFirstCall = callCount === 1;
        const formData = await opts.body.formData?.() ?? opts.body;
        const data = formData.get('data');
        const body = JSON.parse(await data.text());
        // dispatchEvent doesn't wait for this async listener, so without
        // queuing, this slow first save would resolve (and overwrite
        // _project) after the fast second save already did.
        if (isFirstCall) await new Promise((resolve) => { setTimeout(resolve, 20); });
        savedBody = body;
        return jsonResponse({});
      }
      return jsonResponse({});
    };

    const first = el.handleSave({
      detail: { data: { mergeUrls: true, urls: [{ basePath: '/a.html', requestIds: { 'fr-CA': 'req-fr-ca' } }] } },
    });
    const second = el.handleSave({
      detail: { data: { mergeUrls: true, urls: [{ basePath: '/a.html', requestIds: { 'es-MX': 'req-es-mx' } }] } },
    });

    await Promise.all([first, second]);

    expect(savedBody.urls[0].requestIds).to.deep.equal({ 'fr-CA': 'req-fr-ca', 'es-MX': 'req-es-mx' });
  });

  it('keeps an existing error message visible through a save that persists its status', async () => {
    const el = document.createElement('nx-loc');
    el.path = '/project';
    el._project = { org: 'org', site: 'site' };
    el._message = { text: 'Failed to save/start GlobalLink submission.', type: 'error' };

    await el.handleSave({ detail: { data: { langs: [] } } });

    expect(el._message).to.deep.equal({ text: 'Failed to save/start GlobalLink submission.', type: 'error' });
  });

  it('still shows a new message from the save itself even when an error was showing', async () => {
    window.fetch = async (input, opts = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/source/') && opts.method === 'POST') {
        return jsonResponse({}, 500);
      }
      return jsonResponse({});
    };

    const el = document.createElement('nx-loc');
    el.path = '/project';
    el._project = { org: 'org', site: 'site' };
    el._message = { text: 'Failed to save/start GlobalLink submission.', type: 'error' };

    await el.handleSave({ detail: { data: { langs: [] } } });

    expect(el._message).to.deep.equal({ text: 'Unknown error for: /org/site/project.' });
  });

  it('still shows "Saving..." and clears it when there was no prior error', async () => {
    window.fetch = async (input, opts = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/source/') && opts.method === 'POST') {
        await new Promise((resolve) => { setTimeout(resolve, 20); });
        return jsonResponse({});
      }
      return jsonResponse({});
    };

    const el = document.createElement('nx-loc');
    el.path = '/project';
    el._project = { org: 'org', site: 'site' };

    const savePromise = el.handleSave({ detail: { data: { langs: [] } } });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(el._message).to.deep.equal({ text: 'Saving...', transient: true });

    await savePromise;

    expect(el._message).to.equal(undefined);
  });
});

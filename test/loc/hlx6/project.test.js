import { expect } from '@esm-bundle/chai';
import { getDetails, saveStatus, saveLangItems } from '../../../nx/blocks/loc/project/index.js';
import { copy, loadProject, updateProject } from '../../../nx/blocks/loc/utils/utils.js';
import {
  AEM_API, calls, installFetch, makeSite, restoreFetch,
} from './mock-fetch.js';

const DOC = '<body><header></header><main><div><p>Hello</p></div></main><footer></footer></body>';

describe('loc project storage on Helix 6', () => {
  let org;
  let site;
  let base;

  beforeEach(() => {
    ({ org, site } = makeSite({ hlx6: true }));
    base = `${AEM_API}/${org}/sites/${site}/source`;
  });

  afterEach(() => restoreFetch());

  it('creates and loads a project through the source bus', async () => {
    installFetch(({ method }) => (method === 'POST'
      ? new Response('', { status: 201 })
      : new Response(JSON.stringify({ title: 'Loaded' }), { status: 200 })));

    const { project, hash } = await updateProject({ updates: { org, site, title: 'New', view: 'basics' } });
    expect(project.title).to.equal('New');
    expect(calls[0].method).to.equal('POST');
    expect(calls[0].url).to.match(new RegExp(`^${base}/\\.da/translation/active/\\d+\\.json$`));
    expect(JSON.parse(calls[0].body).title).to.equal('New');
    expect(hash).to.match(new RegExp(`^/basics/${org}/${site}/\\.da/translation/active/\\d+$`));

    const loaded = await loadProject({ path: `/${org}/${site}/.da/translation/active/42`, updateDocTitle: false });
    expect(loaded.project.title).to.equal('Loaded');
    expect(calls[1].url).to.equal(`${base}/.da/translation/active/42.json`);
  });

  it('reads and saves the project status through the source bus', async () => {
    installFetch(({ method }) => (method === 'POST'
      ? new Response('', { status: 201 })
      : new Response(JSON.stringify({ title: 'Status' }), { status: 200 })));
    window.location.hash = `#/${org}/${site}/.da/translation/active/7`;

    const details = await getDetails();
    expect(details.title).to.equal('Status');
    expect(calls[0].url).to.equal(`${base}/.da/translation/active/7.json`);

    const state = { org, site, urls: [{ basePath: '/a.html', content: 'x' }] };
    const result = await saveStatus(state);
    expect(result).to.equal(state);
    expect(calls[1].method).to.equal('POST');
    expect(calls[1].url).to.equal(`${base}/.da/translation/active/7.json`);
    expect(JSON.parse(calls[1].body).urls[0].content).to.be.undefined;
  });

  it('overwrites a destination with the supplied content and versions it', async () => {
    installFetch(() => new Response('', { status: 201 }));
    const url = { sourceContent: DOC, destination: `/${org}/${site}/de/page.html` };

    const resp = await copy.overwriteCopy(url, 'Project');
    expect(resp.ok).to.equal(true);
    expect(url.status).to.equal('success');
    expect(calls[0].url).to.equal(`${base}/de/page.html`);
    expect(await calls[0].body.text()).to.equal(DOC);
    expect(calls[0].headers['Content-Type']).to.equal('text/html');
    const version = new URL(calls[1].url);
    expect(`${version.origin}${version.pathname}`).to.equal(`${base}/de/page.html/.versions`);
    expect(version.searchParams.get('comment')).to.equal('Project - Rolled Out');
  });

  it('copies source content read from the source bus', async () => {
    installFetch(({ method }) => (method === 'GET'
      ? new Response(DOC, { status: 200 })
      : new Response('', { status: 201 })));
    const url = { source: `/${org}/${site}/en/page.html`, destination: `/${org}/${site}/en/us/page.html` };

    const resp = await copy.overwriteCopy(url, 'Project');
    expect(resp.ok).to.equal(true);
    expect(calls[0].url).to.equal(`${base}/en/page.html`);
    expect(calls[1].method).to.equal('POST');
    expect(calls[1].url).to.equal(`${base}/en/us/page.html`);
    expect(calls[1].body).to.include('<p>Hello</p>');
    expect(calls[2].url).to.include(`${base}/en/us/page.html/.versions`);
  });

  it('merges by reading both copies and the site config from the source bus', async () => {
    const regional = DOC.replace('Hello', 'Hallo');
    installFetch(({ method, url }) => {
      if (method === 'POST') return new Response('', { status: 201 });
      if (url.endsWith('/.da/translate.json')) return new Response('', { status: 404 });
      return new Response(url.includes('/en/us/') ? regional : DOC, { status: 200 });
    });
    const url = { source: `/${org}/${site}/en/page.html`, destination: `/${org}/${site}/en/us/page.html` };

    const resp = await copy.mergeCopy(url, 'Project');
    expect(resp.ok).to.equal(true);
    expect(url.status).to.equal('success');
    const reads = calls.filter((call) => call.method === 'GET').map((call) => call.url);
    expect(reads).to.have.members([
      `${base}/en/us/page.html`,
      `${base}/en/page.html`,
      `${base}/.da/translate.json`,
    ]);
    const write = calls.find((call) => call.method === 'POST' && !call.url.includes('/.versions'));
    expect(write.url).to.equal(`${base}/en/us/page.html`);
    expect(write.body).to.include('da-diff-added');
    expect(calls.every((call) => call.url.startsWith(AEM_API))).to.equal(true);
  });

  it('saves translated items as raw bodies', async () => {
    installFetch(() => new Response('', { status: 201 }));
    window.location.hash = `#/${org}/${site}/.da/translation/active/8`;
    const items = [{ basePath: '/page.html', blob: new Blob([DOC], { type: 'text/html' }) }];
    const removeDnt = async (html) => html;

    const results = await saveLangItems(`/${org}/${site}`, items, { location: '/de' }, removeDnt);
    expect(results).to.deep.equal([{ success: 201 }]);
    expect(calls[0].url).to.equal(`${base}/de/page.html`);
    expect(calls[0].body).to.equal(DOC);
  });
});

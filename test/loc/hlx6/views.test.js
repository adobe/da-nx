import { expect } from '@esm-bundle/chai';
import { fetchProject, copyProject, archiveProject } from '../../../nx/blocks/loc/views/dashboard/index.js';
import createProjectData from '../../../nx/blocks/loc/views/dashboard/project-data.js';
import { rolloutLang } from '../../../nx/blocks/loc/views/rollout/index.js';
import { getUrls, copySourceLangs } from '../../../nx/blocks/loc/views/translate/index.js';
import { fetchBlockSchema, fetchKeywordsFile } from '../../../nx/blocks/loc/connectors/glaas/translationMetadata.js';
import '../../../nx/blocks/loc/views/validate/validate.js';
import '../../../nx/blocks/loc/views/dashboard/dashboard.js';
import {
  AEM_API, DA_ADMIN, calls, installFetch, makeSite, restoreFetch, waitFor,
} from './mock-fetch.js';

const DOC = '<body><header></header><main><div><p>Hello</p></div></main><footer></footer></body>';

const json = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

describe('loc views on Helix 6', () => {
  let org;
  let site;
  let base;

  beforeEach(() => {
    ({ org, site } = makeSite({ hlx6: true }));
    base = `${AEM_API}/${org}/sites/${site}/source`;
  });

  afterEach(() => restoreFetch());

  describe('dashboard', () => {
    it('fetches, copies and archives projects through the source bus', async () => {
      installFetch(({ method }) => {
        if (method === 'GET') return json({ org, site, title: 'Proj', langs: [] });
        return new Response(null, { status: method === 'DELETE' ? 204 : 201 });
      });
      const projectPath = `/${org}/${site}/.da/translation/active/1`;
      const { signal } = new AbortController();

      const result = await fetchProject(`${projectPath}.json`, { signal });
      expect(result.ok).to.equal(true);
      expect(result.data.title).to.equal('Proj');
      expect(calls[0].url).to.equal(`${base}/.da/translation/active/1.json`);
      expect(calls[0].signal).to.equal(signal);

      const { path: newPath } = await copyProject({ path: projectPath }, 'me@example.com');
      const saved = calls.find((call) => call.method === 'POST');
      expect(saved.url).to.equal(`${base}${newPath.replace(`/${org}/${site}`, '')}.json`);
      expect(JSON.parse(saved.body).title).to.equal('Proj-copy');

      calls.length = 0;
      const archived = await archiveProject({ path: projectPath });
      expect(archived).to.equal(`/${org}/${site}/.da/translation/archive/1`);
      const copy = new URL(calls[0].url);
      expect(calls[0].method).to.equal('PUT');
      expect(`${copy.origin}${copy.pathname}`).to.equal(`${base}/.da/translation/archive/1.json`);
      expect(copy.searchParams.get('source')).to.equal('/.da/translation/active/1.json');
      expect(calls[1].method).to.equal('DELETE');
      expect(calls[1].url).to.equal(`${base}/.da/translation/active/1.json`);
    });

    it('treats a missing project folder as an empty list', async () => {
      installFetch(() => new Response('', { status: 404 }));
      const errors = [];
      const data = await createProjectData({
        org, site, currentUser: 'me', initialType: 'active', handleError: (e) => errors.push(e),
      });
      expect(calls[0].url).to.equal(`${base}/.da/translation/active/`);
      expect(errors).to.deep.equal([]);
      expect(data.getTotalCount()).to.equal(0);
    });

    it('lists projects newest first from the source bus', async () => {
      installFetch(({ url }) => (url.endsWith('/') ? json([
        { name: '100.json', 'content-type': 'application/json', 'last-modified': '2026-10-01T00:00:00.000Z' },
        { name: '200.json', 'content-type': 'application/json', 'last-modified': '2026-10-02T00:00:00.000Z' },
      ]) : json({ org, site, title: 'Proj', langs: [] })));
      const data = await createProjectData({
        org, site, currentUser: 'me', initialType: 'active', handleError: () => {},
      });
      expect(data.getTotalCount()).to.equal(2);
      calls.length = 0;
      await data.getDetailsForProjects(0, 1);
      expect(calls.map((call) => call.url)).to.deep.equal([`${base}/.da/translation/active/200.json`]);
    });

    it('still reports authorization errors', async () => {
      installFetch(() => new Response('', { status: 403 }));
      const errors = [];
      await createProjectData({
        org, site, currentUser: 'me', initialType: 'active', handleError: (e) => errors.push(e),
      });
      expect(errors[0].criticalError.status).to.equal(403);
    });
  });

  describe('dashboard when the site check fails', () => {
    it('reports a missing project folder as an error, as main does', async () => {
      const unreachable = makeSite({ pingFails: true });
      installFetch(() => new Response('', { status: 404 }));
      const errors = [];
      const data = await createProjectData({
        org: unreachable.org,
        site: unreachable.site,
        currentUser: 'me',
        initialType: 'active',
        handleError: (e) => errors.push(e),
      });
      expect(calls[0].url).to.equal(`${DA_ADMIN}/list/${unreachable.org}/${unreachable.site}/.da/translation/active`);
      expect(errors.map((e) => e.criticalError.status)).to.deep.equal([404]);
      expect(data.getTotalCount()).to.equal(0);
    });
  });

  describe('rollout', () => {
    it('reads the language source and writes each locale through the source bus', async () => {
      installFetch(({ method, url }) => {
        if (url.endsWith('.json')) return new Response('', { status: 404 });
        return method === 'GET' ? new Response(DOC, { status: 200 }) : new Response('', { status: 201 });
      });
      const lang = { name: 'English', location: '/en', locales: [{ code: '/en/us' }], rollout: {} };
      const result = await rolloutLang({
        org,
        site,
        title: 'Proj',
        options: { 'source.language': { location: '/en' }, 'rollout.conflict.behavior': 'overwrite' },
        lang,
        urls: [{ suppliedPath: '/en/page' }],
        actions: { requestUpdate: () => {} },
      });
      expect(result).to.deep.equal({});
      expect(lang.rollout.status).to.equal('complete');
      expect(calls.find((call) => call.method === 'GET' && call.url.endsWith('.html')).url)
        .to.equal(`${base}/en/page.html`);
      const write = calls.find((call) => call.method === 'POST');
      expect(write.url).to.equal(`${base}/en/us/page.html`);
      expect(await write.body.text()).to.include('<p>Hello</p>');
      await waitFor(() => calls.some((call) => call.url.includes('/.versions')));
      expect(calls.every((call) => call.url.startsWith(AEM_API))).to.equal(true);
    });
  });

  describe('translate', () => {
    it('fetches content to translate from the source bus without cache-control', async () => {
      installFetch(({ url }) => (url.endsWith('/.da/translate.json')
        ? json({ config: { data: [] } })
        : new Response(DOC, { status: 200 })));
      const { urls } = await getUrls(org, site, {}, '/en', '/en', [{ suppliedPath: '/en/page' }], true);
      expect(urls[0].content).to.equal(DOC);
      const contentCall = calls.find((call) => call.url === `${base}/en/page.html`);
      expect(contentCall).to.exist;
      expect(contentCall.headers['Cache-Control']).to.be.undefined;
    });

    it('counts copies saved with 201 as saved', async () => {
      installFetch(() => new Response('', { status: 201 }));
      const langs = [{ code: 'de', location: '/de' }];
      const urls = [{ suppliedPath: '/en/page', content: DOC }];
      await copySourceLangs(
        org,
        site,
        'Proj',
        { 'copy.conflict.behavior': 'overwrite', 'source.language': { location: '/en' } },
        langs,
        urls,
        [{ urls }],
      );
      expect(calls[0].url).to.equal(`${base}/de/page.html`);
      expect(langs[0].copy).to.deep.equal({ saved: 1, status: 'complete' });
      await waitFor(() => calls.some((call) => call.url.includes('/.versions')));
    });
  });

  describe('validate', () => {
    it('checks urls against the source bus', async () => {
      installFetch(() => new Response(DOC, { status: 200 }));
      const Validate = customElements.get('nx-loc-validate');
      const ctx = {
        _org: org,
        _site: site,
        findFragments: async () => {},
        requestUpdate: () => {},
      };
      const url = new URL(`https://main--${site}--${org}.aem.page/en/page`);
      await Validate.prototype.checkUrl.call(ctx, url);
      expect(calls[0].url).to.equal(`${base}/en/page.html`);
      expect(url.status).to.equal('ready');
    });
  });

  describe('GLaaS translation metadata', () => {
    it('reads block schema and page metadata files from the source bus', async () => {
      installFetch(() => json({ data: [] }));
      await fetchBlockSchema(org, site, { reset: true });
      await fetchKeywordsFile(org, site, '/en/page.html');
      await waitFor(() => calls.length === 2);
      expect(calls[0].url).to.equal(`${base}/.da/block-schema.json`);
      expect(calls[1].url).to.equal(`${base}/en/page-keywords.json`);
    });
  });
});

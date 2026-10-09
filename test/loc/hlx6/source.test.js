import { expect } from '@esm-bundle/chai';
import {
  getSource, saveSource, listSource, moveSource, createVersion, sourceFetch, loadCopyConfig,
} from '../../../nx/blocks/loc/utils/source.js';
import {
  AEM_API, DA_ADMIN, calls, installFetch, makeSite, restoreFetch,
} from './mock-fetch.js';

const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('loc source helpers', () => {
  afterEach(() => restoreFetch());

  describe('on a Helix 6 site', () => {
    it('reads from the source bus without a cache-control header', async () => {
      installFetch();
      const { org, site } = makeSite({ hlx6: true });
      const { signal } = new AbortController();
      await getSource(`/${org}/${site}/en/page.html`, { noCache: true, signal });
      expect(calls[0].url).to.equal(`${AEM_API}/${org}/sites/${site}/source/en/page.html`);
      expect(calls[0].headers['Cache-Control']).to.be.undefined;
      expect(calls[0].signal).to.equal(signal);
    });

    it('saves a raw body to the source bus', async () => {
      installFetch(() => new Response('', { status: 201 }));
      const { org, site } = makeSite({ hlx6: true });
      const resp = await saveSource(`/${org}/${site}/.da/translation/active/1.json`, '{"a":1}');
      expect(resp.ok).to.equal(true);
      expect(calls[0].url).to.equal(`${AEM_API}/${org}/sites/${site}/source/.da/translation/active/1.json`);
      expect(calls[0].method).to.equal('POST');
      expect(calls[0].body).to.equal('{"a":1}');
      expect(calls[0].headers['Content-Type']).to.equal('application/json');
    });

    it('lists a folder through the source bus and reports a missing folder as 404', async () => {
      installFetch(() => new Response('', { status: 404 }));
      const { org, site } = makeSite({ hlx6: true });
      const result = await listSource(`/${org}/${site}/.da/translation/active`);
      expect(calls[0].url).to.equal(`${AEM_API}/${org}/sites/${site}/source/.da/translation/active/`);
      expect(result.ok).to.equal(false);
      expect(result.status).to.equal(404);
    });

    it('moves by copying within the site and deleting the original', async () => {
      installFetch(() => new Response('', { status: 201 }));
      const { org, site } = makeSite({ hlx6: true });
      await moveSource(
        `/${org}/${site}/.da/translation/active/1.json`,
        `/${org}/${site}/.da/translation/archive/1.json`,
      );
      const copy = new URL(calls[0].url);
      expect(calls[0].method).to.equal('PUT');
      expect(`${copy.origin}${copy.pathname}`).to.equal(`${AEM_API}/${org}/sites/${site}/source/.da/translation/archive/1.json`);
      expect(copy.searchParams.get('source')).to.equal('/.da/translation/active/1.json');
      expect(calls[1].method).to.equal('DELETE');
      expect(calls[1].url).to.equal(`${AEM_API}/${org}/sites/${site}/source/.da/translation/active/1.json`);
    });

    it('creates a version with the label as comment', async () => {
      installFetch(() => new Response('', { status: 201 }));
      const { org, site } = makeSite({ hlx6: true });
      await createVersion(`/${org}/${site}/de/page.html`, 'Project - Rolled Out');
      const url = new URL(calls[0].url);
      expect(calls[0].method).to.equal('POST');
      expect(`${url.origin}${url.pathname}`).to.equal(`${AEM_API}/${org}/sites/${site}/source/de/page.html/.versions`);
      expect(url.searchParams.get('comment')).to.equal('Project - Rolled Out');
    });

    it('maps the copy engine DA admin calls to the source bus', async () => {
      installFetch(() => new Response('', { status: 201 }));
      const { org, site } = makeSite({ hlx6: true });
      const body = new FormData();
      body.append('data', new Blob(['{"a":1}'], { type: 'application/json' }));
      await sourceFetch(`${DA_ADMIN}/source/${org}/${site}/de/sheet.json`, { method: 'POST', body });
      await sourceFetch(`${DA_ADMIN}/versionsource/${org}/${site}/de/sheet.json`, {
        method: 'POST', body: JSON.stringify({ label: 'Project - Rolled Out' }),
      });
      await sourceFetch(`${DA_ADMIN}/source/${org}/${site}/de/page.html`);
      expect(calls[0].method).to.equal('POST');
      expect(calls[0].url).to.equal(`${AEM_API}/${org}/sites/${site}/source/de/sheet.json`);
      expect(await calls[0].body.text()).to.equal('{"a":1}');
      const version = new URL(calls[1].url);
      expect(`${version.origin}${version.pathname}`).to.equal(`${AEM_API}/${org}/sites/${site}/source/de/sheet.json/.versions`);
      expect(version.searchParams.get('comment')).to.equal('Project - Rolled Out');
      expect(calls[2].method).to.equal('GET');
      expect(calls[2].url).to.equal(`${AEM_API}/${org}/sites/${site}/source/de/page.html`);
    });

    it('reads the copy config from the site only', async () => {
      installFetch(() => new Response('', { status: 404 }));
      const { org, site } = makeSite({ hlx6: true });
      const config = await loadCopyConfig({ org, site });
      expect(config).to.deep.equal({ config: { data: [] } });
      expect(calls.map((call) => call.url)).to.deep.equal([
        `${AEM_API}/${org}/sites/${site}/source/.da/translate.json`,
      ]);
    });

    it('keeps at most 4 requests in flight per site', async () => {
      let active = 0;
      let peak = 0;
      installFetch(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await delay(40);
        active -= 1;
        return new Response('<main></main>', { status: 200 });
      });
      const { org, site } = makeSite({ hlx6: true });
      const paths = Array.from({ length: 8 }, (_, i) => `/${org}/${site}/en/page-${i}.html`);
      const resps = await Promise.all(paths.map((path) => getSource(path)));
      expect(resps.every((resp) => resp.ok)).to.equal(true);
      expect(calls).to.have.length(8);
      expect(peak).to.be.at.most(4);
    });
  });

  describe('on a legacy DA site', () => {
    it('reads from admin.da.live and keeps the cache-control header', async () => {
      installFetch();
      const { org, site } = makeSite();
      await getSource(`/${org}/${site}/en/page.html`, { noCache: true });
      expect(calls[0].url).to.equal(`${DA_ADMIN}/source/${org}/${site}/en/page.html`);
      expect(calls[0].headers['Cache-Control']).to.equal('no-cache');
    });

    it('saves as multipart form data', async () => {
      installFetch();
      const { org, site } = makeSite();
      await saveSource(`/${org}/${site}/de/page.html`, '<body><main></main></body>');
      expect(calls[0].url).to.equal(`${DA_ADMIN}/source/${org}/${site}/de/page.html`);
      expect(calls[0].body).to.be.instanceOf(FormData);
    });

    it('lists through /list and moves through /move', async () => {
      installFetch(() => new Response('[]', { status: 200 }));
      const { org, site } = makeSite();
      const result = await listSource(`/${org}/${site}/.da/translation/active`);
      expect(result.ok).to.equal(true);
      expect(calls[0].url).to.equal(`${DA_ADMIN}/list/${org}/${site}/.da/translation/active`);
      await moveSource(
        `/${org}/${site}/.da/translation/active/1.json`,
        `/${org}/${site}/.da/translation/archive/1.json`,
      );
      expect(calls[1].url).to.equal(`${DA_ADMIN}/move/${org}/${site}/.da/translation/active/1.json`);
      expect(calls[1].body.get('destination')).to.equal(`/${org}/${site}/.da/translation/archive/1.json`);
    });

    it('creates a version through /versionsource with a label body', async () => {
      installFetch();
      const { org, site } = makeSite();
      await createVersion(`/${org}/${site}/de/page.html`, 'Project - Rolled Out');
      expect(calls[0].url).to.equal(`${DA_ADMIN}/versionsource/${org}/${site}/de/page.html`);
      expect(JSON.parse(calls[0].body)).to.deep.equal({ label: 'Project - Rolled Out' });
    });

    it('passes the copy engine DA admin calls through unchanged', async () => {
      installFetch();
      const { org, site } = makeSite();
      const body = JSON.stringify({ label: 'Project - Rolled Out' });
      await sourceFetch(`${DA_ADMIN}/versionsource/${org}/${site}/de/page.html`, { method: 'POST', body });
      await sourceFetch(`${DA_ADMIN}/source/${org}/${site}/de/page.html`);
      expect(calls[0].url).to.equal(`${DA_ADMIN}/versionsource/${org}/${site}/de/page.html`);
      expect(calls[0].body).to.equal(body);
      expect(calls[1].url).to.equal(`${DA_ADMIN}/source/${org}/${site}/de/page.html`);
    });

    it('falls back to the org copy config', async () => {
      const { org, site } = makeSite();
      installFetch(({ url }) => (url.includes(`/${org}/.da/`)
        ? new Response(JSON.stringify({ from: 'org' }), { status: 200 })
        : new Response('', { status: 404 })));
      const config = await loadCopyConfig({ org, site });
      expect(config).to.deep.equal({ from: 'org' });
      expect(calls.map((call) => call.url)).to.deep.equal([
        `${DA_ADMIN}/source/${org}/${site}/.da/translate.json`,
        `${DA_ADMIN}/source/${org}/.da/translate.json`,
      ]);
    });

    it('does not throttle legacy reads', async () => {
      let active = 0;
      let peak = 0;
      installFetch(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await delay(20);
        active -= 1;
        return new Response('', { status: 200 });
      });
      const { org, site } = makeSite();
      const paths = Array.from({ length: 8 }, (_, i) => `/${org}/${site}/en/page-${i}.html`);
      await Promise.all(paths.map((path) => getSource(path)));
      expect(peak).to.equal(8);
    });
  });
});

import { expect } from '@esm-bundle/chai';
import { AEM_API, DA_ADMIN, HLX_ADMIN } from '../../../../nx2/utils/utils.js';
import { loadSchemas, saveSchema, deleteSchema } from '../../../../nx/blocks/schema-editor/utils/utils.js';

const SCHEMA = { title: 'FAQs', type: 'object', properties: {} };
const schemaHtml = (json) => `<body><header></header><main><div><pre><code>${json}</code></pre></div></main><footer></footer></body>`;

let counter = 0;
const uniqueOrgSite = () => {
  counter += 1;
  return { org: `org-${Date.now()}-${counter}`, site: `site-${counter}` };
};

const calls = [];
let origFetch;

function installRoutes({ hlx6, routes, pingFails }) {
  calls.length = 0;
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const href = url.toString();
    calls.push({
      url: href, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body,
    });
    if (href.startsWith(`${HLX_ADMIN}/ping/`)) {
      if (pingFails) throw new TypeError('Failed to fetch');
      const headers = hlx6 && !href.endsWith('/.da') ? { 'x-api-upgrade-available': 'true' } : {};
      return new Response('', { status: 200, headers });
    }
    const route = routes[`${opts.method || 'GET'} ${href}`];
    if (!route) return new Response('', { status: 404 });
    return route();
  };
}

const json = (body) => () => new Response(JSON.stringify(body), {
  status: 200, headers: { 'content-type': 'application/json' },
});
const html = (body) => () => new Response(body, { status: 200 });
const status = (code, headers) => () => new Response(null, { status: code, headers });
const pings = () => calls.filter((c) => c.url.startsWith(`${HLX_ADMIN}/ping/`));

describe('schema editor utils', () => {
  afterEach(() => {
    if (origFetch) window.fetch = origFetch;
    origFetch = null;
  });

  describe('Helix 6 site', () => {
    it('lists and loads schemas from the source bus', async () => {
      const { org, site } = uniqueOrgSite();
      const folder = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas`;
      installRoutes({
        hlx6: true,
        routes: {
          [`GET ${folder}/`]: json([
            { name: 'faqs.html', 'content-type': 'text/html', 'last-modified': '2026-10-09T12:00:00.000Z' },
          ]),
          [`GET ${folder}/faqs.html`]: html(schemaHtml(JSON.stringify(SCHEMA))),
        },
      });

      const schemas = await loadSchemas(org, site);

      expect(schemas).to.deep.equal({ faqs: { status: 'loaded', schema: SCHEMA } });
      expect(calls.filter((c) => c.url.startsWith(DA_ADMIN))).to.be.empty;
    });

    it('keeps the schemas that loaded when one request fails at the network level', async () => {
      const { org, site } = uniqueOrgSite();
      const folder = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas`;
      installRoutes({
        hlx6: true,
        routes: {
          [`GET ${folder}/`]: json([
            { name: 'faqs.html', 'content-type': 'text/html' },
            { name: 'slides.html', 'content-type': 'text/html' },
          ]),
          [`GET ${folder}/faqs.html`]: html(schemaHtml(JSON.stringify(SCHEMA))),
          [`GET ${folder}/slides.html`]: () => { throw new TypeError('Failed to fetch'); },
        },
      });

      const schemas = await loadSchemas(org, site);

      expect(Object.keys(schemas)).to.deep.equal(['faqs']);
    });

    it('saves a schema as a raw HTML body to the source bus', async () => {
      const { org, site } = uniqueOrgSite();
      const url = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas/my-schema.html`;
      installRoutes({
        hlx6: true,
        routes: { [`POST ${url}`]: () => new Response('', { status: 201 }) },
      });

      const result = await saveSchema(`/${org}/${site}`, 'my-schema', JSON.stringify(SCHEMA));

      expect(result.error).to.be.undefined;
      const post = calls.find((c) => c.method === 'POST');
      expect(post.url).to.equal(url);
      expect(post.headers['Content-Type']).to.equal('text/html');
      expect(post.body).to.equal(schemaHtml(JSON.stringify(SCHEMA)));
    });

    it('reports a failed save', async () => {
      const { org, site } = uniqueOrgSite();
      const url = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas/my-schema.html`;
      installRoutes({
        hlx6: true,
        routes: { [`POST ${url}`]: () => new Response('', { status: 403 }) },
      });

      const result = await saveSchema(`/${org}/${site}`, 'my-schema', '{}');

      expect(result.error).to.equal('Error saving. Status: 403');
    });

    it('deletes a schema from the source bus', async () => {
      const { org, site } = uniqueOrgSite();
      const url = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas/my-schema.html`;
      installRoutes({
        hlx6: true,
        routes: { [`DELETE ${url}`]: () => new Response(null, { status: 204 }) },
      });

      const result = await deleteSchema(`/${org}/${site}`, 'my-schema');

      expect(result.error).to.be.undefined;
      expect(calls.find((c) => c.method === 'DELETE').url).to.equal(url);
    });

    it('drops a schema whose body cannot be read', async () => {
      const { org, site } = uniqueOrgSite();
      const folder = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas`;
      const brokenBody = new ReadableStream({ start(controller) { controller.error(new Error('reset')); } });
      installRoutes({
        hlx6: true,
        routes: {
          [`GET ${folder}/`]: json([
            { name: 'faqs.html', 'content-type': 'text/html' },
            { name: 'slides.html', 'content-type': 'text/html' },
          ]),
          [`GET ${folder}/faqs.html`]: html(schemaHtml(JSON.stringify(SCHEMA))),
          [`GET ${folder}/slides.html`]: () => new Response(brokenBody, { status: 200 }),
        },
      });

      const schemas = await loadSchemas(org, site);

      expect(Object.keys(schemas)).to.deep.equal(['faqs']);
    });

    it('shows no schemas, and no org schemas, when the site has no schema folder', async () => {
      const { org, site } = uniqueOrgSite();
      const orgPath = `/${org}/.da/forms/schemas`;
      installRoutes({
        hlx6: true,
        routes: {
          [`GET ${DA_ADMIN}/list${orgPath}`]: json([{ name: 'faqs', ext: 'html', path: `${orgPath}/faqs.html` }]),
          [`GET ${DA_ADMIN}/source${orgPath}/faqs.html`]: html(schemaHtml(JSON.stringify(SCHEMA))),
        },
      });

      const schemas = await loadSchemas(org, site);

      expect(schemas).to.deep.equal({});
      expect(calls.filter((c) => c.url.startsWith(DA_ADMIN))).to.be.empty;
    });

    it('fails to load when the site listing is refused', async () => {
      const { org, site } = uniqueOrgSite();
      const folder = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas`;
      installRoutes({
        hlx6: true,
        routes: { [`GET ${folder}/`]: status(403) },
      });

      let error;
      await loadSchemas(org, site).catch((e) => { error = e; });

      expect(error).to.be.instanceOf(Error);
      expect(calls.filter((c) => c.url.startsWith(DA_ADMIN))).to.be.empty;
    });

    it('fails to load when the site listing fails at the network level', async () => {
      const { org, site } = uniqueOrgSite();
      const folder = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas`;
      installRoutes({
        hlx6: true,
        routes: { [`GET ${folder}/`]: () => { throw new TypeError('Failed to fetch'); } },
      });

      let error;
      await loadSchemas(org, site).catch((e) => { error = e; });

      expect(error).to.be.instanceOf(Error);
      expect(calls.filter((c) => c.url.startsWith(DA_ADMIN))).to.be.empty;
    });

    it('creates a schema only after checking that the name is free', async () => {
      const { org, site } = uniqueOrgSite();
      const url = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas/my-schema.html`;
      installRoutes({
        hlx6: true,
        routes: {
          [`HEAD ${url}`]: status(404),
          [`POST ${url}`]: status(201, { location: '/.da/forms/schemas/my-schema.html' }),
        },
      });

      const result = await saveSchema(`/${org}/${site}`, 'my-schema', JSON.stringify(SCHEMA), { create: true });

      expect(result).to.deep.equal({ ok: true });
      expect(calls.filter((c) => c.url === url).map((c) => c.method)).to.deep.equal(['HEAD', 'POST']);
    });

    it('does not create a schema over an existing one', async () => {
      const { org, site } = uniqueOrgSite();
      const url = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas/my-schema.html`;
      installRoutes({
        hlx6: true,
        routes: { [`HEAD ${url}`]: status(200) },
      });

      const result = await saveSchema(`/${org}/${site}`, 'my-schema', '{}', { create: true });

      expect(result.error).to.equal('A schema with this name already exists.');
      expect(calls.some((c) => c.method === 'POST')).to.be.false;
    });

    it('does not create a schema when it cannot check the name', async () => {
      const { org, site } = uniqueOrgSite();
      const url = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas/my-schema.html`;
      installRoutes({
        hlx6: true,
        routes: { [`HEAD ${url}`]: status(503) },
      });

      const result = await saveSchema(`/${org}/${site}`, 'my-schema', '{}', { create: true });

      expect(result.error).to.equal('Error checking the schema name. Status: 503');
      expect(calls.some((c) => c.method === 'POST')).to.be.false;
    });

    it('does not create a schema under a name the source bus would change', async () => {
      const { org, site } = uniqueOrgSite();
      installRoutes({ hlx6: true, routes: {} });

      const results = await Promise.all(['my--schema', '-my-schema', 'my-schema-'].map(
        (id) => saveSchema(`/${org}/${site}`, id, '{}', { create: true }),
      ));

      results.forEach((result) => expect(result.error).to.match(/^Use lowercase letters and numbers/));
      expect(calls.filter((c) => c.url.startsWith(AEM_API))).to.be.empty;
    });

    it('creates a schema named index', async () => {
      const { org, site } = uniqueOrgSite();
      const url = `${AEM_API}/${org}/sites/${site}/source/.da/forms/schemas/index.html`;
      installRoutes({
        hlx6: true,
        routes: {
          [`HEAD ${url}`]: status(404),
          [`POST ${url}`]: status(201, { location: '/.da/forms/schemas/index.html' }),
        },
      });

      const result = await saveSchema(`/${org}/${site}`, 'index', '{}', { create: true });

      expect(result.error).to.be.undefined;
      expect(calls.filter((c) => c.url === url).map((c) => c.method)).to.deep.equal(['HEAD', 'POST']);
    });
  });

  describe('legacy DA site', () => {
    it('lists and loads schemas from admin.da.live', async () => {
      const { org, site } = uniqueOrgSite();
      const path = `/${org}/${site}/.da/forms/schemas`;
      installRoutes({
        hlx6: false,
        routes: {
          [`GET ${DA_ADMIN}/list${path}`]: json([{ name: 'faqs', ext: 'html', path: `${path}/faqs.html` }]),
          [`GET ${DA_ADMIN}/source${path}/faqs.html`]: html(schemaHtml(JSON.stringify(SCHEMA))),
        },
      });

      const schemas = await loadSchemas(org, site);

      expect(schemas).to.deep.equal({ faqs: { status: 'loaded', schema: SCHEMA } });
      expect(calls.filter((c) => c.url.startsWith(AEM_API))).to.be.empty;
    });

    it('lists only HTML schemas, not other files or folders', async () => {
      const { org, site } = uniqueOrgSite();
      const path = `/${org}/${site}/.da/forms/schemas`;
      installRoutes({
        hlx6: false,
        routes: {
          [`GET ${DA_ADMIN}/list${path}`]: json([
            { name: 'faqs', ext: 'html', path: `${path}/faqs.html` },
            { name: 'faqs', ext: 'json', path: `${path}/faqs.json` },
            { name: 'archive', path: `${path}/archive` },
          ]),
          [`GET ${DA_ADMIN}/source${path}/faqs.html`]: html(schemaHtml(JSON.stringify(SCHEMA))),
          [`GET ${DA_ADMIN}/source${path}/faqs.json`]: json({ data: [] }),
        },
      });

      const schemas = await loadSchemas(org, site);

      expect(schemas).to.deep.equal({ faqs: { status: 'loaded', schema: SCHEMA } });
      expect(calls.filter((c) => c.url.startsWith(`${DA_ADMIN}/source`)).map((c) => c.url))
        .to.deep.equal([`${DA_ADMIN}/source${path}/faqs.html`]);
    });

    it('keeps a schema with invalid JSON as raw text for repair', async () => {
      const { org, site } = uniqueOrgSite();
      const path = `/${org}/${site}/.da/forms/schemas`;
      installRoutes({
        hlx6: false,
        routes: {
          [`GET ${DA_ADMIN}/list${path}`]: json([{ name: 'broken', ext: 'html', path: `${path}/broken.html` }]),
          [`GET ${DA_ADMIN}/source${path}/broken.html`]: html(schemaHtml('{ "title": ')),
        },
      });

      const schemas = await loadSchemas(org, site);

      expect(schemas).to.deep.equal({ broken: { status: 'invalid-json', raw: '{ "title": ' } });
    });

    it('falls back to the org schemas when the site listing fails', async () => {
      const { org, site } = uniqueOrgSite();
      const orgPath = `/${org}/.da/forms/schemas`;
      installRoutes({
        hlx6: false,
        routes: {
          [`GET ${DA_ADMIN}/list${orgPath}`]: json([{ name: 'faqs', ext: 'html', path: `${orgPath}/faqs.html` }]),
          [`GET ${DA_ADMIN}/source${orgPath}/faqs.html`]: html(schemaHtml(JSON.stringify(SCHEMA))),
        },
      });

      const schemas = await loadSchemas(org, site);

      expect(Object.keys(schemas)).to.deep.equal(['faqs']);
    });

    it('fails to load when the site listing fails at the network level', async () => {
      const { org, site } = uniqueOrgSite();
      const path = `/${org}/${site}/.da/forms/schemas`;
      installRoutes({
        hlx6: false,
        routes: { [`GET ${DA_ADMIN}/list${path}`]: () => { throw new TypeError('Failed to fetch'); } },
      });

      let error;
      await loadSchemas(org, site).catch((e) => { error = e; });

      expect(error).to.be.instanceOf(Error);
      expect(calls.filter((c) => c.url.startsWith(`${DA_ADMIN}/list/${org}/.da`))).to.be.empty;
    });

    it('lists the site schemas from admin.da.live when the backend check fails', async () => {
      const { org, site } = uniqueOrgSite();
      const path = `/${org}/${site}/.da/forms/schemas`;
      installRoutes({
        pingFails: true,
        routes: {
          [`GET ${DA_ADMIN}/list${path}`]: json([{ name: 'faqs', ext: 'html', path: `${path}/faqs.html` }]),
          [`GET ${DA_ADMIN}/source${path}/faqs.html`]: html(schemaHtml(JSON.stringify(SCHEMA))),
        },
      });

      const schemas = await loadSchemas(org, site);

      expect(schemas).to.deep.equal({ faqs: { status: 'loaded', schema: SCHEMA } });
      expect(calls.filter((c) => c.url.startsWith(AEM_API))).to.be.empty;
    });

    it('saves and deletes on admin.da.live when the backend check fails', async () => {
      const { org, site } = uniqueOrgSite();
      const url = `${DA_ADMIN}/source/${org}/${site}/.da/forms/schemas/my-schema.html`;
      installRoutes({
        pingFails: true,
        routes: {
          [`POST ${url}`]: () => new Response('{}', { status: 201 }),
          [`DELETE ${url}`]: () => new Response(null, { status: 204 }),
        },
      });

      const saved = await saveSchema(`/${org}/${site}`, 'my-schema', JSON.stringify(SCHEMA), { create: true });
      const deleted = await deleteSchema(`/${org}/${site}`, 'my-schema');

      expect(saved.error).to.be.undefined;
      expect(deleted.error).to.be.undefined;
      expect(calls.filter((c) => !c.url.startsWith(`${HLX_ADMIN}/ping/`)).map((c) => `${c.method} ${c.url}`))
        .to.deep.equal([`POST ${url}`, `DELETE ${url}`]);
    });

    it('lists org-level schemas when no site is given', async () => {
      const { org } = uniqueOrgSite();
      const orgPath = `/${org}/.da/forms/schemas`;
      installRoutes({
        hlx6: false,
        routes: {
          [`GET ${DA_ADMIN}/list${orgPath}`]: json([{ name: 'faqs', ext: 'html', path: `${orgPath}/faqs.html` }]),
          [`GET ${DA_ADMIN}/source${orgPath}/faqs.html`]: html(schemaHtml(JSON.stringify(SCHEMA))),
        },
      });

      const schemas = await loadSchemas(org);

      expect(Object.keys(schemas)).to.deep.equal(['faqs']);
      expect(calls.filter((c) => c.url.startsWith(AEM_API))).to.be.empty;
      expect(pings()).to.be.empty;
    });

    it('saves an org-level schema to admin.da.live', async () => {
      const { org } = uniqueOrgSite();
      const url = `${DA_ADMIN}/source/${org}/.da/forms/schemas/my-schema.html`;
      installRoutes({
        hlx6: false,
        routes: { [`POST ${url}`]: () => new Response('{}', { status: 201 }) },
      });

      const result = await saveSchema(`/${org}`, 'my-schema', JSON.stringify(SCHEMA), { create: true });

      expect(result.error).to.be.undefined;
      expect(calls.find((c) => c.method === 'POST').url).to.equal(url);
      expect(calls.filter((c) => c.url.startsWith(AEM_API))).to.be.empty;
      expect(pings()).to.be.empty;
    });

    it('saves a schema as multipart form data to admin.da.live', async () => {
      const { org, site } = uniqueOrgSite();
      const url = `${DA_ADMIN}/source/${org}/${site}/.da/forms/schemas/my-schema.html`;
      installRoutes({
        hlx6: false,
        routes: { [`POST ${url}`]: () => new Response('{}', { status: 201 }) },
      });

      const result = await saveSchema(`/${org}/${site}`, 'my-schema', JSON.stringify(SCHEMA), { create: true });

      expect(result.error).to.be.undefined;
      expect(calls.some((c) => c.method === 'HEAD')).to.be.false;
      const post = calls.find((c) => c.method === 'POST');
      expect(post.url).to.equal(url);
      expect(post.body).to.be.instanceOf(FormData);
      expect(await post.body.get('data').text()).to.equal(schemaHtml(JSON.stringify(SCHEMA)));
    });

    it('deletes a schema from admin.da.live', async () => {
      const { org, site } = uniqueOrgSite();
      const url = `${DA_ADMIN}/source/${org}/${site}/.da/forms/schemas/my-schema.html`;
      installRoutes({
        hlx6: false,
        routes: { [`DELETE ${url}`]: () => new Response(null, { status: 204 }) },
      });

      const result = await deleteSchema(`/${org}/${site}`, 'my-schema');

      expect(result.error).to.be.undefined;
      expect(calls.find((c) => c.method === 'DELETE').url).to.equal(url);
    });

    it('deletes an org-level schema from admin.da.live without a backend check', async () => {
      const { org } = uniqueOrgSite();
      const url = `${DA_ADMIN}/source/${org}/.da/forms/schemas/my-schema.html`;
      installRoutes({
        hlx6: false,
        routes: { [`DELETE ${url}`]: () => new Response(null, { status: 204 }) },
      });

      const result = await deleteSchema(`/${org}`, 'my-schema');

      expect(result.error).to.be.undefined;
      expect(calls.map((c) => c.url)).to.deep.equal([url]);
    });
  });
});

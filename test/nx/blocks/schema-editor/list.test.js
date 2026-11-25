import { expect } from '@esm-bundle/chai';
import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { loadSchemas } from '../../../../nx/blocks/schema-editor/utils/utils.js';

describe('schema editor list', () => {
  let origFetch;

  afterEach(() => {
    window.fetch = origFetch;
  });

  it('lists only HTML schemas, not other files or folders', async () => {
    const path = '/org/site/.da/forms/schemas';
    const schema = { title: 'FAQs', type: 'object', properties: {} };
    const requested = [];
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const key = `${opts.method || 'GET'} ${url}`;
      if (!String(url).includes('/ping/')) requested.push(key);
      if (key === `GET ${DA_ADMIN}/list${path}`) {
        return new Response(JSON.stringify([
          { name: 'faqs', ext: 'html', path: `${path}/faqs.html` },
          { name: 'faqs', ext: 'json', path: `${path}/faqs.json` },
          { name: 'archive', path: `${path}/archive` },
        ]), { status: 200 });
      }
      if (key === `GET ${DA_ADMIN}/source${path}/faqs.html`) {
        return new Response(`<body><main><pre><code>${JSON.stringify(schema)}</code></pre></main></body>`, { status: 200 });
      }
      if (key === `GET ${DA_ADMIN}/source${path}/faqs.json`) return new Response('{"data":[]}', { status: 200 });
      return new Response('', { status: 404 });
    };

    const schemas = await loadSchemas('org', 'site');

    expect(schemas).to.deep.equal({ faqs: { status: 'loaded', schema } });
    expect(requested).to.deep.equal([`GET ${DA_ADMIN}/list${path}`, `GET ${DA_ADMIN}/source${path}/faqs.html`]);
  });
});

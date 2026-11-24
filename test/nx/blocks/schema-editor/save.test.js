import { expect } from '@esm-bundle/chai';
import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { loadSchemas, saveSchema } from '../../../../nx/blocks/schema-editor/utils/utils.js';

describe('schema editor save', () => {
  let origFetch;

  afterEach(() => {
    window.fetch = origFetch;
  });

  it('keeps markup and entities in schema text when saving and reading it back', async () => {
    const path = '/org/site/.da/forms/schemas';
    const schema = { title: 'FAQs', description: 'Use <em>small</em> &copy; exactly, $& too.', type: 'object', properties: {} };
    let stored;
    origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const key = `${opts.method || 'GET'} ${url}`;
      if (key === `POST ${DA_ADMIN}/source${path}/faqs.html`) {
        stored = await opts.body.get('data').text();
        return new Response('{}', { status: 201 });
      }
      if (key === `GET ${DA_ADMIN}/list${path}`) {
        return new Response(JSON.stringify([{ name: 'faqs', ext: 'html', path: `${path}/faqs.html` }]), { status: 200 });
      }
      if (key === `GET ${DA_ADMIN}/source${path}/faqs.html`) return new Response(stored, { status: 200 });
      return new Response('', { status: 404 });
    };

    await saveSchema('/org/site', 'faqs', JSON.stringify(schema));
    const schemas = await loadSchemas('org', 'site');

    expect(stored).not.to.include('<em>');
    expect(schemas.faqs).to.deep.equal({ status: 'loaded', schema });
  });
});

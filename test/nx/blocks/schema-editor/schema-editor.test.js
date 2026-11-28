import { expect } from '@esm-bundle/chai';
import { DA_ADMIN, HLX_ADMIN } from '../../../../nx2/utils/utils.js';
import '../../../../nx/blocks/schema-editor/schema-editor.js';

const SCHEMA = { title: 'FAQs', type: 'object', properties: {} };
const schemaHtml = (json) => `<body><header></header><main><div><pre><code>${json}</code></pre></div></main><footer></footer></body>`;

let counter = 0;
let origFetch;
let el;

function installRoutes({ routes, pingFails }) {
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const href = url.toString();
    if (href.startsWith(`${HLX_ADMIN}/ping/`)) {
      if (pingFails) throw new TypeError('Failed to fetch');
      return new Response('', { status: 200 });
    }
    const route = routes[`${opts.method || 'GET'} ${href}`];
    if (!route) return new Response('', { status: 404 });
    return route();
  };
}

async function waitFor(check) {
  for (let i = 0; i < 100; i += 1) {
    if (check()) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  throw new Error('Timed out waiting for the schema editor');
}

async function mount(routes, { pingFails } = {}) {
  counter += 1;
  const org = `org-${Date.now()}-${counter}`;
  const site = `site-${counter}`;
  installRoutes({ routes: routes(`/${org}/${site}/.da/forms/schemas`), pingFails });
  history.replaceState(null, '', `#/${org}/${site}`);
  el = document.createElement('nx-schema-editor');
  document.body.append(el);
  await waitFor(() => el._alert);
  return el;
}

const button = (label) => [...el.shadowRoot.querySelectorAll('sl-button')]
  .find((btn) => btn.textContent.trim() === label);

const schemaRoutes = (path) => ({
  [`GET ${DA_ADMIN}/list${path}`]: () => new Response(JSON.stringify([{ name: 'faqs', ext: 'html', path: `${path}/faqs.html` }]), { status: 200 }),
  [`GET ${DA_ADMIN}/source${path}/faqs.html`]: () => new Response(schemaHtml(JSON.stringify(SCHEMA)), { status: 200 }),
});

describe('schema editor', () => {
  afterEach(() => {
    el?.remove();
    window.fetch = origFetch;
    history.replaceState(null, '', window.location.pathname);
  });

  it('shows a load error, and no editor, when the schemas cannot be loaded', async () => {
    await mount((path) => ({
      [`GET ${DA_ADMIN}/list${path}`]: () => { throw new TypeError('Failed to fetch'); },
    }), { pingFails: true });

    expect(el._alert.message).to.equal('Could not load schemas. Reload the page to try again.');
    expect(el.shadowRoot.querySelector('.schema-select-wrapper')).to.be.null;
  });

  it('shows a working editor again when a later load succeeds', async () => {
    await mount(schemaRoutes);
    const { _org: org, _site: site } = el;

    const workingFetch = window.fetch;
    window.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await el.handleDetail({ detail: { org, site: `${site}-down` } });
    expect(el._alert.message).to.equal('Could not load schemas. Reload the page to try again.');

    window.fetch = workingFetch;
    await el.handleDetail({ detail: { org, site } });
    await el.updateComplete;

    expect(el.codeEditor.querySelector('.cm-editor')).to.exist;
    expect(el._editor.state.doc.toString()).to.equal(JSON.stringify(SCHEMA, null, 2));
  });

  it('shows a failed save as an alert', async () => {
    await mount((path) => ({
      ...schemaRoutes(path),
      [`POST ${DA_ADMIN}/source${path}/faqs.html`]: () => new Response('', { status: 500 }),
    }));

    button('Save schema').click();
    await waitFor(() => el._alert.message === 'Error saving. Status: 500');

    expect(el._alert.type).to.equal('warning');
    expect(el._currentSchema).to.equal('faqs');
  });

  it('shows a failed delete as an alert and keeps the schema', async () => {
    await mount((path) => ({
      ...schemaRoutes(path),
      [`DELETE ${DA_ADMIN}/source${path}/faqs.html`]: () => new Response('', { status: 500 }),
    }));

    button('Delete schema').click();
    await waitFor(() => el._alert.message === 'Error deleting. Status: 500');

    expect(el._alert.type).to.equal('warning');
    expect(el._schemas.faqs.schema).to.deep.equal(SCHEMA);
  });

  it('selects a new schema once it is saved', async () => {
    await mount((path) => ({
      [`GET ${DA_ADMIN}/list${path}`]: () => new Response('[]', { status: 200 }),
      [`POST ${DA_ADMIN}/source${path}/my-schema.html`]: () => new Response('{}', { status: 201 }),
    }));
    expect(el._createNew).to.be.true;

    el.newInput.value = 'my-schema';
    button('Save schema').click();
    await waitFor(() => el._alert.message === 'Schema saved.');
    await el.updateComplete;

    expect(el._createNew).to.be.undefined;
    expect(el._currentSchema).to.equal('my-schema');
    expect(button('Delete schema')).to.exist;
  });
});

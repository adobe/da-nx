import { expect } from '@esm-bundle/chai';
import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import '../../../../nx/blocks/schema-editor/schema-editor.js';

const SCHEMA = { title: 'FAQs', type: 'object', properties: {} };
const schemaHtml = (json) => `<body><header></header><main><div><pre><code>${json}</code></pre></div></main><footer></footer></body>`;

let counter = 0;
let origFetch;
let el;

async function waitFor(check) {
  for (let i = 0; i < 100; i += 1) {
    if (check()) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  throw new Error('Timed out waiting for the schema editor');
}

async function mount(routes) {
  counter += 1;
  const org = `org-${Date.now()}-${counter}`;
  const site = `site-${counter}`;
  const path = `/${org}/${site}/.da/forms/schemas`;
  const allRoutes = {
    [`GET ${DA_ADMIN}/list${path}`]: () => new Response(JSON.stringify([{ name: 'faqs', ext: 'html', path: `${path}/faqs.html` }]), { status: 200 }),
    [`GET ${DA_ADMIN}/source${path}/faqs.html`]: () => new Response(schemaHtml(JSON.stringify(SCHEMA)), { status: 200 }),
    ...routes(path),
  };
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const route = allRoutes[`${opts.method || 'GET'} ${url}`];
    return route ? route() : new Response('', { status: 404 });
  };
  history.replaceState(null, '', `#/${org}/${site}`);
  el = document.createElement('nx-schema-editor');
  document.body.append(el);
  await waitFor(() => el._currentSchema);
  return el;
}

describe('schema editor errors', () => {
  afterEach(() => {
    el?.remove();
    window.fetch = origFetch;
    history.replaceState(null, '', window.location.pathname);
  });

  it('shows a failed save as an alert', async () => {
    await mount((path) => ({
      [`POST ${DA_ADMIN}/source${path}/faqs.html`]: () => new Response('', { status: 500 }),
    }));

    await el.handleSave(true);

    expect(el._alert.message).to.equal('Error saving. Status: 500');
  });

  it('shows a failed delete as an alert', async () => {
    await mount((path) => ({
      [`DELETE ${DA_ADMIN}/source${path}/faqs.html`]: () => new Response('', { status: 500 }),
    }));

    await el.handleDelete();

    expect(el._alert.message).to.equal('Error deleting. Status: 500');
    expect(el._schemas.faqs).to.exist;
  });
});

import { expect } from '@esm-bundle/chai';
import '../../../../nx/blocks/graphql/shared/site-picker/site-picker.js';
import '../../../../nx/blocks/graphql/nx-gql-endpoint-list/nx-gql-endpoint-list.js';
import '../../../../nx/blocks/graphql/nx-gql-endpoint-editor/nx-gql-endpoint-editor.js';
import '../../../../nx/blocks/graphql/nx-gql-endpoints/nx-gql-endpoints.js';
import '../../../../nx/blocks/graphql/nx-gql-header/nx-gql-header.js';
import { buildPreview } from '../../../../nx/blocks/graphql/utils/sdl.js';
import { createDraft } from '../../../../nx/blocks/graphql/utils/endpoint.js';

const product = { type: 'object', title: 'Product', properties: { title: { type: 'string' } } };
const schemas = [
  { id: 'broken', status: 'invalid-json', valid: false, issues: ['Bad JSON.'] },
  {
    id: 'product', status: 'loaded', schema: product, valid: true, issues: [],
  },
];

const mount = async (tag, props) => {
  const el = Object.assign(document.createElement(tag), props);
  document.body.append(el);
  await el.updateComplete;
  return el;
};

const waitFor = async (check, tries = 50) => {
  for (let i = 0; i < tries && !check(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  expect(check()).to.be.ok;
};

const nextEvent = (el, type) => new Promise((resolve) => {
  el.addEventListener(type, resolve, { once: true });
});

const openTab = async (el, id) => {
  el.shadowRoot.querySelector(`#tab-${id}`).click();
  await el.updateComplete;
};

describe('views', () => {
  afterEach(() => document.body.replaceChildren());

  it('asks for org and site in a dialog and emits site changes', async () => {
    const el = await mount('nx-site-picker', { org: 'Adobe' });
    await waitFor(() => el.shadowRoot.querySelector('nx-dialog'));
    expect(el.shadowRoot.querySelector('nx-dialog').title).to.equal('Choose a site');
    const inputs = [...el.shadowRoot.querySelectorAll('input.nx-input')];
    expect(inputs.map((input) => input.value)).to.deep.equal(['Adobe', '']);
    inputs[1].value = ' My-Site ';

    const changed = nextEvent(el, 'site-change');
    el.shadowRoot.querySelector('nx-dialog .nx-form-btn-primary').click();
    const { detail } = await changed;
    expect(detail).to.deep.equal({ org: 'adobe', site: 'my-site' });
  });

  it('validates the site fields only on submit', async () => {
    const el = await mount('nx-site-picker', { org: 'adobe' });
    await waitFor(() => el.shadowRoot.querySelector('nx-dialog'));
    const root = el.shadowRoot;
    expect(root.querySelector('.nx-input-error-msg')).to.equal(null);

    let changes = 0;
    el.addEventListener('site-change', () => { changes += 1; });
    root.querySelector('nx-dialog .nx-form-btn-primary').click();
    await el.updateComplete;
    const errors = [...root.querySelectorAll('.nx-input-error-msg')];
    expect(errors.map((e) => e.textContent)).to.deep.equal(['A site name is required.']);
    expect(changes).to.equal(0);

    const site = root.querySelector('input[name="site"]');
    site.value = 'x';
    site.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(root.querySelector('.nx-input-error-msg')).to.equal(null);
  });

  it('reports a cancel when no site is chosen yet', async () => {
    const el = await mount('nx-site-picker', {});
    await waitFor(() => el.shadowRoot.querySelector('nx-dialog'));

    const cancelled = nextEvent(el, 'site-cancel');
    el.shadowRoot.querySelector('nx-dialog .nx-form-btn-secondary').click();
    await cancelled;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
  });

  it('changes the current site and reports a cancel', async () => {
    const el = await mount('nx-site-picker', { org: 'o', site: 's' });
    await waitFor(() => el.shadowRoot.querySelector('nx-dialog'));
    expect(el.shadowRoot.querySelector('nx-dialog').title).to.equal('Change site');
    const inputs = [...el.shadowRoot.querySelectorAll('input.nx-input')];
    expect(inputs.map((input) => input.value)).to.deep.equal(['o', 's']);

    const cancelled = nextEvent(el, 'site-cancel');
    el.shadowRoot.querySelector('nx-dialog .nx-form-btn-primary').click();
    await cancelled;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
  });

  it('filters endpoints by name from the Name header', async () => {
    const el = await mount('nx-gql-endpoint-list', { endpoints: ['ios', 'main', 'web-app'] });
    const root = el.shadowRoot;
    const names = () => [...root.querySelectorAll('.endpoint-row .name > a')]
      .map((link) => link.textContent.trim());
    const toggle = root.querySelector('.filter-toggle');
    expect(root.querySelector('input[name="filter"]')).to.equal(null);

    toggle.click();
    await el.updateComplete;
    const input = root.querySelector('input[name="filter"]');
    expect(root.activeElement).to.equal(input);
    expect(toggle.getAttribute('aria-pressed')).to.equal('true');

    input.value = 'I';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(names()).to.deep.equal(['ios', 'main']);

    input.value = 'xyz';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(names()).to.deep.equal([]);
    expect(root.querySelector('.no-match').textContent.trim()).to.equal('No endpoints match "xyz".');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await el.updateComplete;
    expect(root.querySelector('input[name="filter"]')).to.equal(null);
    expect(names()).to.deep.equal(['ios', 'main', 'web-app']);
  });

  it('lists endpoints as links to their pages', async () => {
    const el = await mount('nx-gql-endpoint-list', { org: 'o', site: 's', endpoints: ['a', 'b', 'c', 'd'] });
    const root = el.shadowRoot;
    expect(root.querySelector('.intro')).to.equal(null);
    expect([...root.querySelectorAll('thead th')].map((th) => th.textContent.trim()))
      .to.deep.equal(['', 'Name', 'Endpoint', 'Actions']);
    const rows = [...root.querySelectorAll('.endpoint-row')];
    const links = rows.map((row) => row.querySelector('.name a'));
    expect(links.map((link) => [link.textContent.trim(), link.getAttribute('href')])).to.deep.equal([
      ['a', '#/o/s/endpoints/a'], ['b', '#/o/s/endpoints/b'],
      ['c', '#/o/s/endpoints/c'], ['d', '#/o/s/endpoints/d'],
    ]);
    expect(rows[0].querySelector('.endpoint code').textContent).to.equal('/graphql/a');

    const followed = [];
    links.forEach((link) => link.addEventListener('click', (e) => {
      e.preventDefault();
      followed.push(link.textContent.trim());
    }));
    rows[1].querySelector('.endpoint code').click();
    expect(followed).to.deep.equal(['b']);
  });

  it('offers delete as a row icon action', async () => {
    const el = await mount('nx-gql-endpoint-list', { endpoints: ['a', 'b'] });
    const rows = [...el.shadowRoot.querySelectorAll('.endpoint-row')];
    const labels = (row) => [...row.querySelectorAll('.row-action')]
      .map((button) => button.getAttribute('aria-label'));
    expect(labels(rows[0])).to.deep.equal(['Delete a']);
    expect(labels(rows[1])).to.deep.equal(['Delete b']);
    const copy = rows[0].querySelector('.endpoint .copy');
    expect(copy.getAttribute('aria-label')).to.equal('Copy endpoint /graphql/a');

    let followed = 0;
    rows[1].querySelector('.name a').addEventListener('click', (e) => {
      e.preventDefault();
      followed += 1;
    });
    const deleted = nextEvent(el, 'endpoint-delete');
    rows[1].querySelector('.delete').click();
    expect((await deleted).detail).to.deep.equal({ endpoint: 'b' });
    expect(followed).to.equal(0);
  });

  it('shows an empty endpoint list', async () => {
    const el = await mount('nx-gql-endpoint-list', { endpoints: [] });
    expect(el.shadowRoot.querySelector('.empty')).to.exist;
    expect(el.shadowRoot.querySelector('.endpoint-row')).to.equal(null);
  });

  it('renders the editor tabs and emits schema selections', async () => {
    const draft = { ...createDraft(), name: 'main', schemas: ['gone'] };
    const el = await mount('nx-gql-endpoint-editor', {
      draft,
      schemas,
      preview: buildPreview({ draft, schemas }),
    });
    const tab = (id) => openTab(el, id);
    expect(el.tab).to.equal('schemas');
    expect([...el.shadowRoot.querySelectorAll('[role="tab"]')].map((button) => button.id))
      .to.deep.equal(['tab-schemas', 'tab-graphql']);
    expect(el.shadowRoot.querySelector('input, textarea')).to.equal(null);
    expect(el.shadowRoot.querySelector('.summary')).to.equal(null);
    el.preview = { sdl: 'type Query', errors: [], warnings: [{ code: 'x' }, { code: 'y' }] };
    await el.updateComplete;
    await tab('graphql');
    expect(el.shadowRoot.querySelector('nx-gql-sdl-preview .inline-alert')).to.equal(null);
    el.preview = buildPreview({ draft, schemas });
    await el.updateComplete;

    await tab('graphql');
    expect(el.tab).to.equal('graphql');
    expect(el.shadowRoot.querySelector('.panel-intro').textContent)
      .to.match(/^A read-only preview of the GraphQL schema generated from the\s+Structured Content/);
    await tab('schemas');
    expect(el.shadowRoot.querySelector('#tab-schemas').getAttribute('aria-selected')).to.equal('true');
    const picker = el.shadowRoot.querySelector('nx-gql-schema-picker');
    await picker.updateComplete;
    const boxes = [...picker.shadowRoot.querySelectorAll('.schema-option input[type="checkbox"]')];
    expect(boxes.map((box) => [box.value, box.checked, box.disabled])).to.deep.equal([
      ['broken', false, true],
      ['gone', true, false],
      ['product', false, false],
    ]);

    const toggled = nextEvent(el, 'schemas-select');
    boxes[2].click();
    const { detail } = await toggled;
    expect(detail).to.deep.equal({ ids: ['product'], selected: true });

    const headers = [...picker.shadowRoot.querySelectorAll('thead th')];
    expect(headers.map((th) => th.textContent.trim())).to.deep.equal(['', 'Title', 'ID', 'Status']);
    const rowToggled = nextEvent(el, 'schemas-select');
    picker.shadowRoot.querySelector('.schema-option:has(input[value="gone"]) .schema-id').click();
    expect((await rowToggled).detail).to.deep.equal({ ids: ['gone'], selected: false });

    await tab('graphql');
    expect(el.shadowRoot.querySelector('nx-gql-schema-picker')).to.equal(null);
    expect(el.shadowRoot.querySelector('nx-gql-sdl-preview .inline-alert.error')).to.exist;

    el.draft = { ...draft, name: 'renamed' };
    await el.updateComplete;
    expect(el.tab).to.equal('graphql');
    el.draft = { ...draft, name: 'other', isNew: false };
    await el.updateComplete;
    expect(el.tab).to.equal('schemas');
  });

  it('sorts the schema picker by its columns', async () => {
    const draft = createDraft({ config: { name: 'main', schemas: ['product'] } });
    const el = await mount('nx-gql-endpoint-editor', {
      draft, schemas, preview: buildPreview({ draft, schemas }),
    });
    await openTab(el, 'schemas');
    const picker = el.shadowRoot.querySelector('nx-gql-schema-picker');
    await picker.updateComplete;
    const tag = (id) => picker.shadowRoot.querySelector(`.schema-option:has(input[value="${id}"]) .status-light`);
    expect(tag('product')).to.equal(null);
    expect([tag('broken').textContent.trim(), tag('broken').title]).to.deep.equal(['Invalid', 'Bad JSON.']);

    const rowIds = () => [...picker.shadowRoot.querySelectorAll('.schema-option input')]
      .map((input) => input.value);
    const header = (label) => [...picker.shadowRoot.querySelectorAll('th.sortable')]
      .find((th) => th.textContent.trim() === label);
    expect(rowIds()).to.deep.equal(['broken', 'product']);
    expect(header('Title').getAttribute('aria-sort')).to.equal('ascending');
    header('Title').querySelector('button').click();
    await picker.updateComplete;
    expect(rowIds()).to.deep.equal(['product', 'broken']);
    expect(header('Title').getAttribute('aria-sort')).to.equal('descending');
    header('Status').querySelector('button').click();
    await picker.updateComplete;
    expect(rowIds()).to.deep.equal(['broken', 'product']);
    expect(header('Status').getAttribute('aria-sort')).to.equal('ascending');
    expect(header('Title').hasAttribute('aria-sort')).to.equal(false);
  });

  it('shows a read-only editor without editing controls', async () => {
    const draft = createDraft({ config: { name: 'main', schemas: ['product'] } });
    const el = await mount('nx-gql-endpoint-editor', {
      draft,
      schemas,
      readOnly: true,
    });
    const picker = el.shadowRoot.querySelector('nx-gql-schema-picker');
    await picker.updateComplete;
    const boxes = [...picker.shadowRoot.querySelectorAll('input[type="checkbox"]')];
    expect(boxes.every((box) => box.disabled)).to.equal(true);
  });

  it('shows a read-only list with copy but no row actions', async () => {
    const el = await mount('nx-gql-endpoint-list', {
      readOnly: true,
      endpoints: ['a'],
    });
    expect(el.shadowRoot.querySelector('.row-action')).to.equal(null);
    expect(el.shadowRoot.querySelector('.endpoint .copy')).to.exist;
  });

  it('explains an empty selection in the Schemas tab', async () => {
    const el = await mount('nx-gql-endpoint-editor', { draft: createDraft(), schemas });
    expect(el.shadowRoot.querySelector('.panel .inline-alert.no-schemas').textContent)
      .to.include('At least one Structured Content schema must be selected.');
    el.draft = { ...el.draft, schemas: ['product'] };
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.no-schemas')).to.equal(null);
    el.draft = createDraft();
    el.readOnly = true;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.no-schemas')).to.equal(null);
  });

  it('guides to the Schemas tab when no schema is selected', async () => {
    const el = await mount('nx-gql-endpoint-editor', { draft: createDraft(), schemas });
    await openTab(el, 'graphql');
    const empty = el.shadowRoot.querySelector('.graphql-empty');
    expect(empty.textContent).to.include('No schemas selected');
    expect(el.shadowRoot.querySelector('nx-gql-sdl-preview')).to.equal(null);
    empty.querySelector('sl-button').click();
    await el.updateComplete;
    expect(el.tab).to.equal('schemas');
    expect(el.shadowRoot.querySelector('nx-gql-schema-picker')).to.exist;
  });

  it('keeps the tab after the first save of a new endpoint', async () => {
    const draft = { ...createDraft(), name: 'main', schemas: ['product'] };
    const el = await mount('nx-gql-endpoint-editor', { draft, schemas });
    await openTab(el, 'graphql');
    el.draft = createDraft({ config: draft });
    await el.updateComplete;
    expect(el.tab).to.equal('graphql');
  });

  it('starts a new endpoint with nothing selected', async () => {
    const el = await mount('nx-gql-endpoint-editor', { draft: createDraft(), schemas });
    await openTab(el, 'schemas');
    const picker = el.shadowRoot.querySelector('nx-gql-schema-picker');
    await picker.updateComplete;
    const boxes = [...picker.shadowRoot.querySelectorAll('.schema-option input[type="checkbox"]')];
    expect(boxes.map((box) => [box.value, box.checked, box.disabled])).to.deep.equal([
      ['broken', false, true],
      ['product', false, false],
    ]);
    expect(picker.shadowRoot.querySelector('.count').textContent).to.equal('0 of 2 selected');
  });

  it('searches schemas locally', async () => {
    const draft = { ...createDraft(), schemas: ['product'] };
    const el = await mount('nx-gql-endpoint-editor', { draft, schemas });
    await openTab(el, 'schemas');
    const picker = el.shadowRoot.querySelector('nx-gql-schema-picker');
    await picker.updateComplete;
    const root = picker.shadowRoot;
    expect(root.querySelector('.count').textContent).to.equal('1 of 2 selected');

    const search = root.querySelector('input[type="search"]');
    search.value = 'brok';
    search.dispatchEvent(new Event('input'));
    await picker.updateComplete;
    const ids = [...root.querySelectorAll('td.schema-id')].map((node) => node.textContent);
    expect(ids).to.deep.equal(['broken']);

    search.value = 'nothing';
    search.dispatchEvent(new Event('input'));
    await picker.updateComplete;
    expect(root.querySelector('.no-match').textContent).to.include('nothing');
    expect(root.querySelector('.count').textContent).to.equal('1 of 2 selected');
  });

  it('compares the editor selection with the saved schemas', async () => {
    const draft = createDraft({ config: { name: 'main', schemas: ['product'] } });
    const el = await mount('nx-gql-endpoint-editor', {
      draft, schemas, savedSchemas: ['broken'], preview: buildPreview({ draft, schemas }),
    });
    await openTab(el, 'schemas');
    const picker = el.shadowRoot.querySelector('nx-gql-schema-picker');
    await picker.updateComplete;
    const tag = (id) => picker.shadowRoot
      .querySelector(`.schema-option:has(input[value="${id}"]) .status-light`).textContent.trim();
    expect([tag('product'), tag('broken')]).to.deep.equal(['Adding', 'Removing']);
  });

  it('marks unsaved schema changes and counts them', async () => {
    const options = [
      {
        id: 'a', selected: true, usable: true, issues: [], change: 'adding',
      },
      {
        id: 'b', selected: false, usable: true, issues: [], change: 'removing',
      },
      { id: 'c', selected: true, usable: true, issues: [] },
    ];
    const el = await mount('nx-gql-schema-picker', { options });
    const tags = [...el.shadowRoot.querySelectorAll('.schema-option')]
      .map((row) => row.querySelector('.status-light')?.textContent.trim());
    expect(tags).to.deep.equal(['Adding', 'Removing', undefined]);
    expect(el.shadowRoot.querySelector('.count').textContent.replace(/\s+/g, ' ').trim())
      .to.equal('2 of 3 selected · 1 adding, 1 removing');
  });

  it('shows the status of each schema', async () => {
    const options = [
      { id: 'a', selected: true, usable: true, issues: [] },
      { id: 'b', selected: false, usable: true, issues: [] },
      { id: 'e', selected: true, usable: false, issues: ['Bad JSON.'] },
      {
        id: 'f', selected: true, usable: false, missing: true, issues: [],
      },
    ];
    const el = await mount('nx-gql-schema-picker', {
      options,
      schemaEditorHref: 'https://da.live/apps/schema#/o/s',
    });
    const tags = [...el.shadowRoot.querySelectorAll('.schema-option')].map((row) => {
      const tag = row.querySelector('.status-light');
      return tag ? [tag.className, tag.textContent.trim(), tag.title] : null;
    });
    expect(tags).to.deep.equal([
      null,
      null,
      ['status-light negative', 'Invalid', 'Bad JSON.'],
      ['status-light negative', 'Not found',
        'This schema no longer exists. Deselect it to remove it from the endpoint.'],
    ]);

    const links = [...el.shadowRoot.querySelectorAll('.editor-link')];
    expect(links.map((link) => [link.getAttribute('href'), link.target]))
      .to.deep.equal([['https://da.live/apps/schema#/o/s', '_blank']]);
    let toggles = 0;
    el.addEventListener('schemas-select', () => { toggles += 1; });
    links[0].addEventListener('click', (e) => e.preventDefault());
    links[0].click();
    expect(toggles).to.equal(0);
  });

  it('selects or clears all visible usable schemas', async () => {
    const options = [
      { id: 'a', selected: false, usable: true, issues: [] },
      { id: 'b', selected: true, usable: true, issues: [] },
      { id: 'bad', selected: false, usable: false, issues: ['x'] },
    ];
    const el = await mount('nx-gql-schema-picker', { options });
    const box = () => el.shadowRoot.querySelector('thead .select-all');
    const state = () => [box().checked, box().indeterminate];
    expect(state()).to.deep.equal([false, true]);
    expect(el.shadowRoot.querySelector('.link')).to.equal(null);
    expect(el.shadowRoot.querySelector('.schema-option:has(input:checked) .schema-id').textContent)
      .to.equal('b');

    const selectedAll = nextEvent(el, 'schemas-select');
    box().click();
    expect((await selectedAll).detail).to.deep.equal({ ids: ['a', 'b'], selected: true });

    el.options = options.map((option) => ({ ...option, selected: option.usable }));
    await el.updateComplete;
    expect(state()).to.deep.equal([true, false]);
    const cleared = nextEvent(el, 'schemas-select');
    box().click();
    expect((await cleared).detail).to.deep.equal({ ids: ['a', 'b'], selected: false });

    el.options = options.map((option) => ({ ...option, selected: false }));
    await el.updateComplete;
    expect(state()).to.deep.equal([false, false]);
    el.shadowRoot.querySelector('.search').value = 'bad';
    el.shadowRoot.querySelector('.search').dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(box().disabled).to.equal(true);
  });

  it('searches schemas by status label', async () => {
    const options = [
      { id: 'a', usable: true, selected: true, issues: [] },
      { id: 'b', usable: false, selected: false, issues: ['x'] },
    ];
    const el = await mount('nx-gql-schema-picker', { options });
    const search = el.shadowRoot.querySelector('.search');
    search.value = 'invalid';
    search.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect([...el.shadowRoot.querySelectorAll('.schema-option .schema-id')]
      .map((cell) => cell.textContent)).to.deep.equal(['b']);
  });

  it('shows titles first and hides the Status column when no schema has a status', async () => {
    const options = [
      { id: 'z-page', title: 'Page', usable: true, selected: false, issues: [] },
      { id: 'a-card', usable: true, selected: false, issues: [] },
    ];
    const el = await mount('nx-gql-schema-picker', { options });
    const root = el.shadowRoot;
    expect([...root.querySelectorAll('thead th')].map((th) => th.textContent.trim()))
      .to.deep.equal(['', 'Title', 'ID']);
    expect([...root.querySelectorAll('.schema-option')].map((row) => [
      row.querySelector('.schema-title').textContent, row.querySelector('.schema-id').textContent,
    ])).to.deep.equal([['a-card', 'a-card'], ['Page', 'z-page']]);
    expect(root.querySelector('.state')).to.equal(null);
  });

  it('links the empty picker to the Schema Editor', async () => {
    const el = await mount('nx-gql-schema-picker', { options: [], schemaEditorHref: 'https://da.live/apps/schema#/o/s' });
    const link = el.shadowRoot.querySelector('.empty a');
    expect(link.getAttribute('href')).to.equal('https://da.live/apps/schema#/o/s');
    expect(el.shadowRoot.querySelector('.empty').textContent).to.include('no Structured Content schemas');
  });

  it('collects the name of a new endpoint', async () => {
    const el = await mount('nx-gql-endpoints', {
      site: {
        org: 'org', site: 'site', endpoints: ['taken'], schemas: [], canWrite: true,
      },
    });
    const root = el.shadowRoot;
    expect(root.querySelector('nx-dialog')).to.equal(null);
    await el.handleAdd();
    await el.updateComplete;
    const dialog = root.querySelector('nx-dialog');
    expect(dialog.getAttribute('title')).to.equal('New endpoint');
    const name = root.querySelector('input[name="name"]');
    const primary = () => root.querySelector('.nx-form-btn-primary');
    const error = () => root.querySelector('.nx-input-error-msg');
    expect(primary().textContent.trim()).to.equal('Continue');
    expect(error()).to.equal(null);

    let navigations = 0;
    el.addEventListener('route-change', () => { navigations += 1; });
    primary().click();
    await el.updateComplete;
    expect(error().textContent).to.include('is required');
    expect(root.querySelector('.nx-field-error')).to.not.equal(null);

    name.value = 'Tak en';
    name.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(error()).to.equal(null);
    primary().click();
    await el.updateComplete;
    expect(error().textContent).to.include('lowercase letters');

    name.value = 'taken';
    name.dispatchEvent(new Event('input'));
    await el.updateComplete;
    primary().click();
    await el.updateComplete;
    expect(error().textContent).to.include('already exists');
    expect(navigations).to.equal(0);

    name.value = 'ios';
    name.dispatchEvent(new Event('input'));
    await el.updateComplete;
    const navigated = nextEvent(el, 'route-change');
    primary().click();
    expect((await navigated).detail).to.deep.equal({
      route: { org: 'org', site: 'site', endpoint: 'ios' }, isNew: true,
    });
    await el.updateComplete;
    expect(root.querySelector('nx-dialog')).to.equal(null);

    await el.handleAdd();
    await el.updateComplete;
    expect(root.querySelector('input[name="name"]').value).to.equal('');
    root.querySelector('.nx-form-btn-secondary').click();
    await el.updateComplete;
    expect(root.querySelector('nx-dialog')).to.equal(null);
  });

  it('renders the trail and emits header actions', async () => {
    const el = await mount('nx-gql-header', { org: 'org', site: 'site', addable: true });
    const root = el.shadowRoot;
    const labels = () => [...root.querySelectorAll('.crumb-label')].map((crumb) => crumb.textContent);
    expect(labels()).to.deep.equal(['GraphQL', 'endpoints']);
    expect(root.querySelector('.site-context span').textContent).to.equal('org / site');

    const added = nextEvent(el, 'endpoint-add');
    root.querySelector('.add-endpoint').click();
    await added;
    let leaked = 0;
    const countLeak = () => { leaked += 1; };
    document.addEventListener('change-site', countLeak);
    const siteChanged = nextEvent(el, 'change-site');
    root.querySelector('.change-site').click();
    await siteChanged;
    document.removeEventListener('change-site', countLeak);
    expect(leaked).to.equal(0);

    el.addable = false;
    el.endpoint = 'main';
    await el.updateComplete;
    expect(labels()).to.deep.equal(['GraphQL', 'endpoints', 'main']);
    expect(root.querySelector('a.crumb-label').getAttribute('href')).to.equal('#/org/site/endpoints');
    expect(root.querySelector('.add-endpoint')).to.equal(null);
  });
});

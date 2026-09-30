import { expect } from '@esm-bundle/chai';
import '../../../../nx/blocks/graphql/shared/site-picker/site-picker.js';
import '../../../../nx/blocks/graphql/nx-gql-endpoint-list/nx-gql-endpoint-list.js';
import '../../../../nx/blocks/graphql/nx-gql-endpoints/nx-gql-endpoints.js';
import '../../../../nx/blocks/graphql/nx-gql-header/nx-gql-header.js';

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

  it('shows a read-only list with copy but no row actions', async () => {
    const el = await mount('nx-gql-endpoint-list', {
      readOnly: true,
      endpoints: ['a'],
    });
    expect(el.shadowRoot.querySelector('.row-action')).to.equal(null);
    expect(el.shadowRoot.querySelector('.endpoint .copy')).to.exist;
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

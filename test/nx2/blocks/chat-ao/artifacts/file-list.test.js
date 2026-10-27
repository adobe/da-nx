import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

const ITEMS = [
  { title: 'Home', path: '/acme/site/index.html' },
  { title: 'About us', path: '/acme/site/about.html' },
  { title: 'Living room', path: '/acme/site/collections/living-room.html' },
];

async function mount(fields = {}, legacy = false) {
  const props = { title: 'Pages to update', items: ITEMS, ...fields };
  const host = document.createElement('div');
  document.body.append(host);
  render(renderUiArtifact({
    components: [legacy ? { type: 'FileList', props }
      : { id: 'root', component: 'FileList', ...props }],
    textFallback: 'Files are available.',
  }), host);
  const element = host.querySelector('nx-file-list');
  await element?.updateComplete;
  return { host, element, root: element?.shadowRoot };
}

describe('artifacts FileList', () => {
  let originalHref;
  const hosts = [];

  beforeEach(() => {
    originalHref = window.location.href;
    window.history.replaceState(null, '', '#/acme/site/index');
  });

  afterEach(() => {
    hosts.forEach((host) => host.remove());
    hosts.length = 0;
    window.history.replaceState(null, '', originalHref);
  });

  async function fixture(fields, legacy) {
    const result = await mount(fields, legacy);
    hosts.push(result.host);
    return result;
  }

  it('renders the agent title, count, file titles and site-relative paths', async () => {
    const { root } = await fixture();
    expect(root.querySelector('h3').textContent).to.equal('Pages to update3');
    expect(root.querySelectorAll('li')).to.have.length(3);
    expect([...root.querySelectorAll('.title')].map((node) => node.textContent))
      .to.deep.equal(ITEMS.map((item) => item.title));
    expect([...root.querySelectorAll('.path')].map((node) => node.textContent))
      .to.deep.equal(['/index.html', '/about.html', '/collections/living-room.html']);
    expect(root.querySelector('a').getAttribute('aria-current')).to.equal('page');
    expect(root.querySelector('.action').textContent.trim()).to.equal('Viewing');
  });

  it('opens the file by changing only the hash and updates the viewing state', async () => {
    const { root, element } = await fixture();
    const { pathname, search } = window.location;
    const changed = new Promise((resolve) => {
      window.addEventListener('hashchange', resolve, { once: true });
    });
    root.querySelectorAll('a')[2].click();
    await changed;
    await element.updateComplete;
    expect(window.location.hash).to.equal('#/acme/site/collections/living-room');
    expect(window.location.pathname).to.equal(pathname);
    expect(window.location.search).to.equal(search);
    expect(root.querySelectorAll('[aria-current="page"]')).to.have.length(1);
    expect(root.querySelectorAll('a')[2].getAttribute('aria-current')).to.equal('page');
  });

  it('tracks navigation from outside the list and clears the current state on another site', async () => {
    const { root, element } = await fixture();
    window.history.replaceState(null, '', '#/acme/site/about.html');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await element.updateComplete;
    expect(root.querySelectorAll('a')[1].getAttribute('aria-current')).to.equal('page');
    window.history.replaceState(null, '', '#/other/site/about');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await element.updateComplete;
    expect(root.querySelector('[aria-current]')).to.equal(null);
  });

  it('supports legacy artifacts, extensionless paths and non-html suffixes', async () => {
    const { root } = await fixture({
      items: [
        { title: 'About', path: '/acme/site/about' },
        { title: 'Data', path: '/acme/site/data.json' },
      ],
    }, true);
    expect([...root.querySelectorAll('a')].map((a) => a.getAttribute('href')))
      .to.deep.equal(['#/acme/site/about', '#/acme/site/data.json']);
  });

  it('renders an empty state and escapes agent-provided titles', async () => {
    const text = '<img src=x onerror=alert(1)>';
    const { root } = await fixture({ title: text, items: [] });
    expect(root.querySelector('img')).to.equal(null);
    expect(root.querySelector('h3').textContent).to.contain(text);
    expect(root.querySelector('.empty').textContent).to.equal('No files to show.');
    const file = await fixture({ items: [{ title: text, path: '/acme/site/home.html' }] });
    expect(file.root.querySelector('img')).to.equal(null);
    expect(file.root.querySelector('.title').textContent).to.equal(text);
  });

  [
    { title: '' },
    { title: { path: '/title' } },
    { items: null },
    { items: [null] },
    { items: [{ title: '', path: '/acme/site/home.html' }] },
    ...[
      // eslint-disable-next-line no-script-url
      '/home.html', '//example.com/a', 'https://example.com/a', 'javascript:alert(1)',
      '/acme/site/../secret', '/acme/site/%2e%2e/secret', '/acme/site/a#b',
      '/acme/site/a?b', '/acme/site/a\\b', '/acme/site/a\nb', '/acme/site/',
    ].map((path) => ({ items: [{ title: 'File', path }] })),
  ].forEach((fields) => {
    it(`falls back for malformed content ${JSON.stringify(fields)}`, async () => {
      const { host, element } = await fixture(fields);
      expect(element).to.equal(null);
      expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('Files are available.');
    });
  });

  it('publishes the FileList schema alongside existing catalog entries', async () => {
    const catalog = await (await fetch('/nx2/blocks/chat-ao/artifacts/component-catalog.json')).json();
    const schema = await (await fetch('/nx2/blocks/chat-ao/artifacts/file-list.schema.json')).json();
    expect(catalog.components.FileList).to.deep.equal(schema);
    expect(catalog.components.PageEvaluationWithIcons).to.be.an('object');
    expect(catalog.functions).to.be.an('object');
    const pattern = new RegExp(schema.properties.items.items.properties.path.pattern);
    expect(ITEMS.every((item) => pattern.test(item.path))).to.be.true;
    expect(pattern.test('/acme/site/../secret')).to.be.false;
    expect(pattern.test('/acme/site/a?b')).to.be.false;
  });
});

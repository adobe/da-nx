import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createCopy } from '../../nx/public/loc/index.js';

const ORIGIN = 'https://admin.da.live';
const SOURCE = '/org/site/de/de/page.html';
const DESTINATION = '/org/site/at/de/page.html';
const html = (text) => `<body><main><div><p>${text}</p></div></main></body>`;

function setup({
  destination = () => new Response(html('Regional')),
  source = () => new Response(html('Upstream')),
  save = () => new Response('{}'),
} = {}) {
  const fetch = sinon.stub().callsFake(async (href, opts) => {
    if (opts?.method === 'POST') return href.includes('/versionsource') ? new Response('{}') : save();
    if (href === `${ORIGIN}/source${DESTINATION}`) return destination();
    if (href === `${ORIGIN}/source${SOURCE}`) return source();
    throw new Error(`Unexpected fetch ${href}`);
  });
  const loadConfig = sinon.stub().resolves({ config: { data: [] } });
  const copy = createCopy({ fetch, loadConfig, daOrigin: ORIGIN });
  const writes = () => fetch.args
    .filter(([href, opts]) => opts?.method === 'POST' && !href.includes('/versionsource'))
    .map(([href]) => href);
  return { copy, writes };
}

const diffFailures = {
  mergeCopy: {
    url: { normalizeImages: () => { throw new Error('Diff failed'); } },
    destination: () => new Response(html('Regional')),
  },
  rolloutCopy: {
    url: {},
    destination: () => new Response('<body><div><p>Regional</p></div></body>'),
  },
};

['mergeCopy', 'rolloutCopy'].forEach((method) => {
  describe(`${method} with an existing or failing destination`, () => {
    afterEach(() => sinon.restore());

    it('overwrites a missing destination', async () => {
      const { copy, writes } = setup({ destination: () => new Response('', { status: 404 }) });
      const url = { source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout');
      expect(writes()).to.deep.equal([`${ORIGIN}/source${DESTINATION}`]);
      expect(url.status).to.equal('success');
    });

    it('overwrites an empty destination', async () => {
      const { copy, writes } = setup({ destination: () => new Response('') });
      const url = { source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout');
      expect(writes()).to.deep.equal([`${ORIGIN}/source${DESTINATION}`]);
      expect(url.status).to.equal('success');
    });

    [401, 403, 500].forEach((status) => {
      it(`writes nothing and reports the path when the destination read answers ${status}`, async () => {
        const { copy, writes } = setup({ destination: () => new Response('', { status }) });
        const url = { source: SOURCE, destination: DESTINATION };
        await copy[method](url, 'Rollout');
        expect(writes()).to.deep.equal([]);
        expect(url.status).to.equal('error');
        expect(url.error).to.include(DESTINATION);
        expect(url.error).to.include(`(${status})`);
      });
    });

    it('writes nothing and reports the path when the destination read fails on the network', async () => {
      const { copy, writes } = setup({
        destination: () => { throw new TypeError('Failed to fetch'); },
      });
      const url = { source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout');
      expect(writes()).to.deep.equal([]);
      expect(url.status).to.equal('error');
      expect(url.error).to.include(DESTINATION);
      expect(url.error).to.include('Failed to fetch');
    });

    it('writes nothing and reports the path when the diff throws', async () => {
      const failure = diffFailures[method];
      const { copy, writes } = setup({ destination: failure.destination });
      const url = { ...failure.url, source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout');
      expect(writes()).to.deep.equal([]);
      expect(url.status).to.equal('error');
      expect(url.error).to.include(DESTINATION);
    });

    it('writes nothing and reports both paths when the source read answers 500', async () => {
      const { copy, writes } = setup({ source: () => new Response('', { status: 500 }) });
      const url = { source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout');
      expect(writes()).to.deep.equal([]);
      expect(url.status).to.equal('error');
      expect(url.error).to.include(DESTINATION);
      expect(url.error).to.include(SOURCE);
      expect(url.error).to.include('(500)');
    });

    it('writes nothing and reports the path when the source is missing', async () => {
      const { copy, writes } = setup({ source: () => new Response('', { status: 404 }) });
      const url = { source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout');
      expect(writes()).to.deep.equal([]);
      expect(url.status).to.equal('error');
      expect(url.error).to.include(DESTINATION);
    });

    it('reports the path when the merged save fails', async () => {
      const { copy } = setup({ save: () => new Response('', { status: 500 }) });
      const url = { source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout');
      expect(url.status).to.equal('error');
      expect(url.error).to.include(DESTINATION);
      expect(url.error).to.include('(500)');
    });
  });
});

describe('overwriteCopy with a failing save', () => {
  afterEach(() => sinon.restore());

  it('reports the path', async () => {
    const { copy } = setup({ save: () => new Response('', { status: 403 }) });
    const url = { destination: DESTINATION, sourceContent: html('Upstream') };
    await copy.overwriteCopy(url, 'Copy');
    expect(url.status).to.equal('error');
    expect(url.error).to.include(DESTINATION);
    expect(url.error).to.include('(403)');
  });
});

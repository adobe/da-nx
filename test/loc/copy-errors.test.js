import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createCopy } from '../../nx/public/loc/copy.js';

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
  return { copy, writes, fetch };
}

const throwingImages = () => { throw new Error('Diff failed'); };

['mergeCopy', 'rolloutCopy'].forEach((method) => {
  describe(`${method} with an existing or failing destination`, () => {
    afterEach(() => sinon.restore());

    it('overwrites a missing destination', async () => {
      const { copy, writes } = setup({ destination: () => new Response('', { status: 404 }) });
      const url = { source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout', { recordBaseline: false });
      expect(writes()).to.deep.equal([`${ORIGIN}/source${DESTINATION}`]);
      expect(url.status).to.equal('success');
    });

    it('overwrites an empty destination', async () => {
      const { copy, writes } = setup({ destination: () => new Response('') });
      const url = { source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout', { recordBaseline: false });
      expect(writes()).to.deep.equal([`${ORIGIN}/source${DESTINATION}`]);
      expect(url.status).to.equal('success');
    });

    [401, 403, 500].forEach((status) => {
      it(`writes nothing and reports the path when the destination read answers ${status}`, async () => {
        const { copy, writes } = setup({ destination: () => new Response('', { status }) });
        const url = { source: SOURCE, destination: DESTINATION };
        await copy[method](url, 'Rollout', { recordBaseline: false });
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
      await copy[method](url, 'Rollout', { recordBaseline: false });
      expect(writes()).to.deep.equal([]);
      expect(url.status).to.equal('error');
      expect(url.error).to.include(DESTINATION);
      expect(url.error).to.include('Failed to fetch');
    });

    it('writes nothing and reports the path when the diff throws', async () => {
      const { copy, writes } = setup();
      const url = { normalizeImages: throwingImages, source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout', { recordBaseline: false });
      expect(writes()).to.deep.equal([]);
      expect(url.status).to.equal('error');
      expect(url.error).to.include(DESTINATION);
    });

    it('writes nothing and reports both paths when the source read answers 500', async () => {
      const { copy, writes } = setup({ source: () => new Response('', { status: 500 }) });
      const url = { source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout', { recordBaseline: false });
      expect(writes()).to.deep.equal([]);
      expect(url.status).to.equal('error');
      expect(url.error).to.include(DESTINATION);
      expect(url.error).to.include(SOURCE);
      expect(url.error).to.include('(500)');
    });

    it('writes nothing and reports the path when the source is missing', async () => {
      const { copy, writes } = setup({ source: () => new Response('', { status: 404 }) });
      const url = { source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout', { recordBaseline: false });
      expect(writes()).to.deep.equal([]);
      expect(url.status).to.equal('error');
      expect(url.error).to.include(DESTINATION);
    });

    it('reports the path when the merged save fails', async () => {
      const { copy } = setup({ save: () => new Response('', { status: 500 }) });
      const url = { source: SOURCE, destination: DESTINATION };
      await copy[method](url, 'Rollout', { recordBaseline: false });
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
    await copy.overwriteCopy(url, 'Copy', { recordBaseline: false });
    expect(url.status).to.equal('error');
    expect(url.error).to.include(DESTINATION);
    expect(url.error).to.include('(403)');
  });
});

describe('copies without a recordBaseline flag', () => {
  afterEach(() => sinon.restore());

  ['mergeCopy', 'overwriteCopy'].forEach((method) => {
    it(`${method} throws and writes nothing`, async () => {
      const { copy, writes } = setup();
      const url = { source: SOURCE, destination: DESTINATION };
      let error;
      try {
        await copy[method](url, 'Copy');
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(TypeError);
      expect(writes()).to.deep.equal([]);
    });
  });
});

describe('engine reports', () => {
  let engine;

  before(async () => {
    ({ engine } = await import('../../nx/public/loc/da-merge.js'));
  });

  afterEach(() => sinon.restore());

  const versions = (fetchArgs) => fetchArgs.filter(([href]) => href.includes('/versionsource'));

  it('explains a copy that would lose content in the editor form, and writes nothing', async () => {
    sinon.stub(engine, 'applyCopy').rejects(Object.assign(new Error('Canonicalizing changes the page'), { code: 'canonicalize-loss' }));
    const { copy, writes } = setup();
    const url = { source: SOURCE, destination: DESTINATION };
    const result = await copy.mergeCopy(url, 'Copy', { recordBaseline: false });
    expect(writes()).to.deep.equal([]);
    expect(result.code).to.equal('canonicalize-loss');
    expect(result.error).to.include('Open the source and the destination in the editor');
    expect(url.status).to.equal('error');
    expect(url.error).to.include(DESTINATION);
    expect(url.error).to.include('Open the source and the destination in the editor, save them, then copy again');
  });

  const lossOn = (side) => {
    sinon.stub(engine, 'applyCopy').rejects(Object.assign(new Error('Canonicalizing would change the page content'), { code: 'canonicalize-loss', side }));
  };

  it('names the destination when canonicalizing it would lose content', async () => {
    lossOn('target');
    const { copy } = setup();
    const url = { source: SOURCE, destination: DESTINATION };
    const result = await copy.mergeCopy(url, 'Copy', { recordBaseline: false });
    expect(result.error).to.include(`Open ${DESTINATION} in the editor, save it, then copy again`);
    expect(url.error).to.not.include(SOURCE);
  });

  it('names the source when canonicalizing it would lose content', async () => {
    lossOn('source');
    const { copy } = setup();
    const url = { source: SOURCE, destination: DESTINATION };
    const result = await copy.mergeCopy(url, 'Copy', { recordBaseline: false });
    expect(result.error).to.include(`Open ${SOURCE} in the editor, save it, then copy again`);
  });

  it('says the supplied source content can\'t be kept when there is no source page to open', async () => {
    lossOn('source');
    const { copy } = setup();
    const url = { destination: DESTINATION, sourceContent: html('Translated') };
    const result = await copy.mergeCopy(url, 'Copy', { recordBaseline: false });
    expect(result.error).to.include('The source content has content that the editor cannot keep');
    expect(result.code).to.equal('canonicalize-loss');
  });

  [true, false].forEach((contentChanged) => {
    it(`${contentChanged ? 'saves' : 'saves no'} version when content changed is ${contentChanged}`, async () => {
      sinon.stub(engine, 'applyCopy').resolves({
        html: html('Merged'), baseline: null, report: { outcome: 'written', contentChanged },
      });
      const { copy, writes, fetch } = setup();
      const url = { source: SOURCE, destination: DESTINATION };
      await copy.mergeCopy(url, 'Copy', { recordBaseline: false });
      expect(writes()).to.deep.equal([`${ORIGIN}/source${DESTINATION}`]);
      expect(url.status).to.equal('success');
      expect(versions(fetch.args)).to.have.length(contentChanged ? 1 : 0);
    });
  });
});

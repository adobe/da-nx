import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../../nx/utils/daFetch.js';
import '../../../nx/blocks/loc/project/views/translate.js';

describe('project translate getSourceContent DNT path', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    globalThis.fetch = sinon.stub().resolves({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '<p>hello</p>',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  const setup = (urls) => {
    const el = document.createElement('nx-loc-translate');
    const addDnt = sinon.stub().callsFake(async (text) => `dnt:${text}`);
    el.urls = urls;
    el._service = { dnt: { addDnt } };
    el.getSiteConfig = async () => ({ dnt: { data: [] } });
    return { el, addDnt };
  };

  it('passes the language-agnostic basePath and file type to addDnt', async () => {
    const { el, addDnt } = setup([
      { srcPath: '/org/site/en/products/prices.json', basePath: '/products/prices.json' },
    ]);

    const ok = await el.getSourceContent();

    expect(ok).to.be.true;
    expect(addDnt.calledOnce).to.be.true;
    expect(addDnt.firstCall.args[1]).to.deep.equal({ dnt: { data: [] } });
    expect(addDnt.firstCall.args[2]).to.deep.equal({
      fileType: 'json',
      path: '/products/prices.json',
    });
    expect(el.urls[0].content).to.equal('dnt:<p>hello</p>');
  });

  it('passes each document its own path', async () => {
    const { el, addDnt } = setup([
      { srcPath: '/org/site/en/a.json', basePath: '/a.json' },
      { srcPath: '/org/site/en/b.html', basePath: '/b.html' },
    ]);

    await el.getSourceContent();

    const opts = addDnt.args.map((args) => args[2]).sort((x, y) => x.path.localeCompare(y.path));
    expect(opts).to.deep.equal([
      { fileType: 'json', path: '/a.json' },
      { fileType: 'html', path: '/b.html' },
    ]);
  });
});

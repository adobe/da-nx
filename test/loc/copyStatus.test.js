import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { mergeCopy, overwriteCopy } from '../../nx/blocks/loc/project/index.js';

const page = (text) => `<body><header></header><main><div><p>${text}</p></div></main><footer></footer></body>`;

const failingSaves = () => sinon.stub().callsFake(async (input, opts) => {
  if (opts?.method === 'POST') return new Response('', { status: 500 });
  if (input.toString().endsWith('.json')) return new Response('', { status: 404 });
  return new Response(page('regional'), { status: 200 });
});

describe('copy status when the save fails', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    globalThis.fetch = failingSaves();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('mergeCopy marks the url as an error', async () => {
    const url = { destination: '/org/site/fr/page.html', sourceContent: page('upstream') };

    const resp = await mergeCopy(url, 'Project');

    expect(resp.status).to.equal(500);
    expect(url.status).to.equal('error');
  });

  it('overwriteCopy returns the failed response', async () => {
    const url = { destination: '/org/site/fr/page.html', sourceContent: page('upstream') };

    const resp = await overwriteCopy(url, 'Project');

    expect(resp.status).to.equal(500);
    expect(url.status).to.equal('error');
  });
});

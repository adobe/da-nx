import { expect } from '@esm-bundle/chai';
import { AEM_API, HLX_ADMIN } from '../../../../nx2/utils/utils.js';
import {
  calls, installFetch, restoreFetch, lastCall,
} from '../../../nx2/mocks/fetch.js';
import { handlePreview, keepMediaBusImagesRelative } from '../../../../nx/blocks/quick-edit-portal/src/utils.js';
import { MESSAGE_TYPES } from '../../../../nx/utils/message-types.js';

// The IMS mock instance that nx2/utils/api.js loads through the import map.
const { resetMockIms, setMockIms } = await import(`${window.location.origin}/nx2/utils/ims.js`);

let counter = 0;
const makeCtx = ({ hlx6 = false, path = '/drafts/page' } = {}) => {
  counter += 1;
  const owner = `qe-preview-${counter}-${Math.floor(Math.random() * 1e6)}`;
  const repo = 'site';
  if (hlx6) {
    localStorage.setItem('hlx6-upgrade', JSON.stringify({
      ...(JSON.parse(localStorage.getItem('hlx6-upgrade')) ?? {}),
      [`/${owner}/${repo}`]: true,
    }));
  }
  const posted = [];
  return {
    owner, repo, path, posted, port: { postMessage: (message) => posted.push(message) },
  };
};

describe('quick-edit portal preview', () => {
  afterEach(() => restoreFetch());

  it('previews through the api on hlx6 sites', async () => {
    installFetch();
    const ctx = makeCtx({ hlx6: true });
    await handlePreview(ctx);

    expect(lastCall().url).to.equal(`${AEM_API}/${ctx.owner}/sites/${ctx.repo}/preview/drafts/page`);
    expect(lastCall().method).to.equal('POST');
    expect(ctx.posted.at(-1)).to.deep.equal({ type: MESSAGE_TYPES.PREVIEW, payload: { ok: true } });
  });

  it('previews through admin.hlx.page on legacy sites', async () => {
    installFetch();
    const ctx = makeCtx();
    await handlePreview(ctx);

    expect(lastCall().url).to.equal(`${HLX_ADMIN}/preview/${ctx.owner}/${ctx.repo}/main/drafts/page`);
    expect(lastCall().method).to.equal('POST');
    expect(ctx.posted.at(-1).payload.ok).to.equal(true);
  });

  it('previews through the legacy admin when the upgrade check fails', async () => {
    installFetch();
    const pingFetch = window.fetch;
    window.fetch = async (url, opts) => {
      if (url.startsWith(`${HLX_ADMIN}/ping/`)) throw new TypeError('Failed to fetch');
      return pingFetch(url, opts);
    };
    const ctx = makeCtx();
    await handlePreview(ctx);

    expect(lastCall().url).to.equal(`${HLX_ADMIN}/preview/${ctx.owner}/${ctx.repo}/main/drafts/page`);
    expect(lastCall().method).to.equal('POST');
    expect(ctx.posted.at(-1)).to.deep.equal({ type: MESSAGE_TYPES.PREVIEW, payload: { ok: true } });
  });

  it('previews the index document of a folder', async () => {
    installFetch();
    const ctx = makeCtx({ hlx6: true, path: '/drafts/' });
    await handlePreview(ctx);

    expect(lastCall().url).to.equal(`${AEM_API}/${ctx.owner}/sites/${ctx.repo}/preview/drafts/index`);
  });

  it('sends the IMS token only in Authorization', async () => {
    installFetch();
    const legacy = makeCtx();
    await handlePreview(legacy);
    const hlx6 = makeCtx({ hlx6: true });
    await handlePreview(hlx6);

    const previews = calls.filter(({ url }) => url.includes('/preview/'));
    expect(previews).to.have.length(2);
    previews.forEach(({ headers }) => {
      expect(headers.Authorization).to.equal('Bearer test-token');
      expect(headers['x-content-source-authorization']).to.equal(undefined);
    });
  });

  it('reports a preview request that fails before a response', async () => {
    restoreFetch();
    const savedFetch = window.fetch;
    window.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const ctx = makeCtx();
    try {
      await handlePreview(ctx);
    } finally {
      window.fetch = savedFetch;
    }

    const { type, payload } = ctx.posted.at(-1);
    expect(type).to.equal(MESSAGE_TYPES.PREVIEW);
    expect(payload.ok).to.equal(false);
    expect(payload.error).to.contain('Failed to preview');
  });

  it('reports a missing sign-in without sending a request', async () => {
    installFetch();
    setMockIms({ anonymous: true });
    const ctx = makeCtx({ hlx6: true });
    try {
      await handlePreview(ctx);
    } finally {
      resetMockIms();
    }

    expect(calls.length).to.equal(0);
    const { type, payload } = ctx.posted.at(-1);
    expect(type).to.equal(MESSAGE_TYPES.PREVIEW);
    expect(payload).to.deep.equal({ ok: false, error: 'Failed to preview: not signed in' });
  });

  it('reports a failed preview', async () => {
    installFetch({ status: 401 });
    const ctx = makeCtx({ hlx6: true });
    await handlePreview(ctx);

    const { type, payload } = ctx.posted.at(-1);
    expect(type).to.equal(MESSAGE_TYPES.PREVIEW);
    expect(payload.ok).to.equal(false);
    expect(payload.error).to.contain('Failed to preview');
  });
});

describe('quick-edit portal media bus images', () => {
  const ref = './media_123.png#width=320&height=160';
  const picture = (src, srcset) => `<picture><source srcset="${srcset}"><source srcset="${srcset}" media="(min-width: 600px)"><img src="${src}"></picture>`;

  it('keeps the picture sources of media bus images relative', () => {
    const html = `<body><main><div>${picture(ref, 'https://da.live/plugins/media_123.png#width=320&height=160')}</div></main></body>`;
    const doc = new DOMParser().parseFromString(keepMediaBusImagesRelative(html), 'text/html');
    expect([...doc.querySelectorAll('source')].map((source) => source.getAttribute('srcset')))
      .to.deep.equal([ref, ref]);
    expect(doc.querySelector('img').getAttribute('src')).to.equal(ref);
  });

  it('keeps linked media bus images relative', () => {
    const resolved = new URL(ref, document.baseURI).href;
    const html = `<body><main><div><p><a href="${resolved}" data-edit-as="image">${resolved}</a></p></div></main></body>`;
    const doc = new DOMParser().parseFromString(keepMediaBusImagesRelative(html), 'text/html');
    const link = doc.querySelector('a');
    expect(link.getAttribute('href')).to.equal(ref);
    expect(link.textContent).to.equal(ref);
  });

  it('leaves other pictures alone', () => {
    const src = 'https://content.da.live/org/site/.page/pic.png';
    const html = `<body><main>${picture(src, src)}</main></body>`;
    expect(keepMediaBusImagesRelative(html)).to.equal(html);
  });
});

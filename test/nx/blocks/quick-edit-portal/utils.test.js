import { expect } from '@esm-bundle/chai';
import { AEM_API, HLX_ADMIN } from '../../../../nx2/utils/utils.js';
import { installFetch, restoreFetch, lastCall } from '../../../nx2/mocks/fetch.js';
import { handlePreview, keepMediaBusImagesRelative } from '../../../../nx/blocks/quick-edit-portal/src/utils.js';
import { MESSAGE_TYPES } from '../../../../nx/utils/message-types.js';

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

  it('previews the index document of a folder', async () => {
    installFetch();
    const ctx = makeCtx({ hlx6: true, path: '/drafts/' });
    await handlePreview(ctx);

    expect(lastCall().url).to.equal(`${AEM_API}/${ctx.owner}/sites/${ctx.repo}/preview/drafts/index`);
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

  it('leaves other pictures alone', () => {
    const src = 'https://content.da.live/org/site/.page/pic.png';
    const html = `<body><main>${picture(src, src)}</main></body>`;
    expect(keepMediaBusImagesRelative(html)).to.equal(html);
  });
});

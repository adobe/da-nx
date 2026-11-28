import { expect } from '@esm-bundle/chai';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { handleImageReplace } from '../../../../nx/blocks/quick-edit-portal/src/images.js';
import { getImageDocumentVersion } from '../../../../nx2/public/utils/quick-edit-images.js';
import { AEM_API, DA_ADMIN, HLX_ADMIN } from '../../../../nx2/utils/utils.js';

const daUploadResponse = (url) => {
  const { pathname } = new URL(url);
  const contentUrl = `https://content.da.live${pathname.replace(/^\/source/, '')}`;
  return new Response(JSON.stringify({ source: { contentUrl } }), { status: 201 });
};

const mockFetch = (onUpload) => {
  window.fetch = async (url, opts = {}) => {
    if (url.startsWith(`${HLX_ADMIN}/ping/`)) return new Response('', { status: 200 });
    return onUpload(url, opts);
  };
};

describe('standalone quick-edit image replacement', () => {
  const imageData = 'data:image/png;base64,iVBORw0KGgo=';
  let savedFetch;
  let ctx;
  let posted;
  let doc;
  let changed;
  let uploads;
  let state;

  beforeEach(() => {
    savedFetch = window.fetch;
    uploads = [];
    mockFetch(async (url, opts) => {
      uploads.push({ url, opts });
      return daUploadResponse(url);
    });
    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { content: 'inline*', group: 'block' },
        text: { group: 'inline' },
        image: { inline: true, group: 'inline', attrs: { src: {}, alt: { default: null } } },
      },
    });
    doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, [
      schema.text('a'),
      schema.nodes.image.create({ src: '/same.png', alt: 'First' }),
      schema.nodes.image.create({ src: '/same.png', alt: 'Second' }),
    ]));
    state = EditorState.create({ schema, doc });
    posted = [];
    ctx = {
      owner: 'org',
      repo: 'site',
      path: '/page',
      view: {
        get state() { return state; },
        dispatch(transaction) {
          state = state.apply(transaction);
          if (transaction.docChanged) changed = transaction;
        },
      },
      port: { postMessage: (message) => posted.push(message) },
    };
    changed = null;
  });

  afterEach(() => { window.fetch = savedFetch; });

  const request = () => ({
    imageData,
    fileName: 'pic.png',
    proseIndex: 3,
    requestId: 'upload-2',
    originalSrc: '/same.png',
    imageVersion: getImageDocumentVersion(ctx.view.state.doc),
  });

  it('updates only the indexed image when URLs match', async () => {
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(changed).to.exist;
    expect(state.doc.nodeAt(3).attrs.alt).to.equal('Second');
    expect(state.doc.nodeAt(3).attrs.src).to.contain('/org/site/.page/pic.png');
    expect(state.doc.nodeAt(2).attrs.src).to.equal('/same.png');
    expect(posted.at(-1).payload.requestId).to.equal('upload-2');
  });

  it('rejects a stale image version before upload', async () => {
    const stale = getImageDocumentVersion(doc);
    ctx.view.dispatch(state.tr.insertText('new ', 2));
    changed = null;
    await handleImageReplace({ ...request(), imageVersion: stale }, ctx);

    expect(uploads).to.have.length(0);
    expect(changed).to.equal(null);
    expect(posted.at(-1).payload.error).to.contain('out of date');
  });

  it('tracks the intended image past a concurrent edit and an identical URL', async () => {
    mockFetch(async (url) => {
      uploads.push(true);
      ctx.view.dispatch(state.tr.insert(3, state.schema.nodes.image.create({
        src: '/same.png', alt: 'New image',
      })));
      return daUploadResponse(url);
    });
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(posted.at(-1).payload.newSrc).to.contain('/org/site/.page/pic.png');
    expect(state.doc.nodeAt(3).attrs).to.include({ src: '/same.png', alt: 'New image' });
    expect(state.doc.nodeAt(4).attrs.alt).to.equal('Second');
    expect(state.doc.nodeAt(4).attrs.src).to.contain('/org/site/.page/pic.png');
  });

  it('accepts an unrelated text edit while the image uploads', async () => {
    mockFetch(async (url) => {
      uploads.push(true);
      ctx.view.dispatch(state.tr.insertText('before ', 2));
      return daUploadResponse(url);
    });
    await handleImageReplace(request(), ctx);

    expect(posted.at(-1).payload.newSrc).to.contain('/org/site/.page/pic.png');
    expect(state.doc.nodeAt(3 + 'before '.length).attrs.alt).to.equal('Second');
    expect(state.doc.nodeAt(3 + 'before '.length).attrs.src).to.contain('/org/site/.page/pic.png');
  });

  it('rejects a removed target even when another image has the same URL', async () => {
    mockFetch(async (url) => {
      uploads.push(true);
      ctx.view.dispatch(state.tr.delete(3, 4).insert(3, state.schema.nodes.image.create({
        src: '/same.png', alt: 'Replacement',
      })));
      return daUploadResponse(url);
    });
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(posted.at(-1).payload.error).to.contain('no longer available');
    expect(state.doc.nodeAt(3).attrs).to.include({ src: '/same.png', alt: 'Replacement' });
  });

  it('refuses an image node reused in two positions', async () => {
    ctx.view.dispatch(state.tr.insert(4, state.doc.nodeAt(3)));
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(posted.at(-1).payload.error).to.contain('no longer available');
    expect(state.doc.nodeAt(3).attrs.src).to.equal('/same.png');
    expect(state.doc.nodeAt(4).attrs.src).to.equal('/same.png');
  });

  it('rejects an ambiguous old URL-only request', async () => {
    await handleImageReplace({ imageData, fileName: 'pic.png', originalSrc: '/same.png' }, ctx);

    expect(uploads).to.have.length(0);
    expect(changed).to.equal(null);
    expect(posted.at(-1).payload.error).to.contain('ambiguous');
  });

  it('uploads to the da source store on legacy sites and uses the returned content url', async () => {
    const contentUrl = 'https://stage-content.da.live/org/site/.page/pic.png';
    mockFetch(async (url, opts) => {
      uploads.push({ url, opts });
      return new Response(JSON.stringify({ source: { contentUrl } }), { status: 201 });
    });
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(uploads[0].url).to.equal(`${DA_ADMIN}/source/org/site/.page/pic.png`);
    expect(uploads[0].opts.body).to.be.instanceof(FormData);
    expect(state.doc.nodeAt(3).attrs.src).to.equal(contentUrl);
    expect(posted.at(-1).payload.newSrc).to.equal(contentUrl);
  });

  it('keeps the webp type of the uploaded file on legacy sites', async () => {
    await handleImageReplace({
      ...request(), imageData: 'data:image/webp;base64,UklGRg==', fileName: 'pic.webp',
    }, ctx);

    expect(uploads[0].url).to.equal(`${DA_ADMIN}/source/org/site/.page/pic.webp`);
    expect(uploads[0].opts.body.get('data').type).to.equal('image/webp');
  });

  it('uploads to the da source store when the upgrade check fails', async () => {
    ctx.owner = `qe-img-down-${Math.floor(Math.random() * 1e6)}`;
    ctx.repo = 'site';
    const contentUrl = `https://content.da.live/${ctx.owner}/site/.page/pic.png`;
    window.fetch = async (url, opts = {}) => {
      if (url.startsWith(`${HLX_ADMIN}/ping/`)) throw new TypeError('Failed to fetch');
      uploads.push({ url, opts });
      return new Response(JSON.stringify({ source: { contentUrl } }), { status: 201 });
    };
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(uploads[0].url).to.equal(`${DA_ADMIN}/source/${ctx.owner}/site/.page/pic.png`);
    expect(uploads[0].opts.body).to.be.instanceof(FormData);
    expect(posted.at(-1).payload.newSrc).to.equal(contentUrl);
  });

  it('uploads to the media bus on hlx6 sites and uses the returned media url', async () => {
    const org = `qe-img-${Math.floor(Math.random() * 1e6)}`;
    const site = 'hlx6-site';
    localStorage.setItem('hlx6-upgrade', JSON.stringify({
      ...(JSON.parse(localStorage.getItem('hlx6-upgrade')) ?? {}),
      [`/${org}/${site}`]: true,
    }));
    ctx.owner = org;
    ctx.repo = site;
    mockFetch(async (url, opts) => {
      uploads.push({ url, opts });
      const uri = `https://main--${site}--${org}.aem.page/media_abc123.png`;
      return new Response(JSON.stringify({ uri, meta: { type: 'image/png' } }), { status: 200 });
    });
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(uploads[0].url).to.equal(`${AEM_API}/${org}/sites/${site}/media/.page/pic.png`);
    expect(uploads[0].opts.method).to.equal('POST');
    expect(uploads[0].opts.body).to.be.instanceof(Blob);
    expect(uploads.some(({ url }) => url.startsWith(DA_ADMIN))).to.equal(false);
    expect(state.doc.nodeAt(3).attrs.src).to.equal('./media_abc123.png');
    expect(posted.at(-1).payload.newSrc).to.equal('./media_abc123.png');
  });

  it('reports the status of a failed upload and leaves the image unchanged', async () => {
    mockFetch(async (url, opts) => {
      uploads.push({ url, opts });
      return new Response('', { status: 413 });
    });
    await handleImageReplace(request(), ctx);

    expect(posted.at(-1).payload.error).to.contain('413');
    expect(changed).to.equal(null);
    expect(state.doc.nodeAt(3).attrs.src).to.equal('/same.png');
  });
});

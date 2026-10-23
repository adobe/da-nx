import { expect } from '@esm-bundle/chai';
import {
  SUPPORTED_IMAGE_TYPES,
  HLX6_MAX_IMAGE_BYTES,
  MAX_IMAGE_BYTES,
  imageTooLargeMessage,
  getImageUploadLimit,
  getMediaUploadPath,
  uploadMedia,
} from '../../../nx2/utils/media-upload.js';

const MB = 1_000_000;

describe('media upload policy', () => {
  it('supports the Canvas image types', () => {
    expect(SUPPORTED_IMAGE_TYPES).to.deep.equal(['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif']);
  });

  it('formats the size limit like Canvas', () => {
    expect(imageTooLargeMessage({ limitBytes: HLX6_MAX_IMAGE_BYTES })).to.equal('Max image size allowed is 4.5 MB');
    expect(imageTooLargeMessage({ limitBytes: MAX_IMAGE_BYTES })).to.equal('Max image size allowed is 20 MB');
  });

  it('skips the site probe for images within the hlx6 limit', async () => {
    const checkHlx6 = async () => { throw new Error('Should not probe.'); };
    expect(await getImageUploadLimit({ org: 'example', site: 'site', size: 4.5 * MB, checkHlx6 }))
      .to.equal(HLX6_MAX_IMAGE_BYTES);
  });

  it('picks the limit by site type for larger images', async () => {
    const probes = [];
    const check = (hlx6) => async (org, site) => {
      probes.push([org, site]);
      return hlx6;
    };
    const size = 5 * MB;
    expect(await getImageUploadLimit({ org: 'example', site: 'site', size, checkHlx6: check(true) }))
      .to.equal(HLX6_MAX_IMAGE_BYTES);
    expect(await getImageUploadLimit({ org: 'example', site: 'site', size, checkHlx6: check(false) }))
      .to.equal(MAX_IMAGE_BYTES);
    expect(probes).to.deep.equal([['example', 'site'], ['example', 'site']]);
  });

  it('falls back to the legacy limit when the site probe fails', async () => {
    const checkHlx6 = async () => { throw new Error('offline'); };
    expect(await getImageUploadLimit({ org: 'example', site: 'site', size: 5 * MB, checkHlx6 }))
      .to.equal(MAX_IMAGE_BYTES);
  });

  it('builds the document-scoped media path', () => {
    expect(getMediaUploadPath({ parent: '/example/site/forms', name: 'sample', fileName: 'a.png' }))
      .to.equal('/example/site/forms/.sample/a.png');
  });
});

describe('uploadMedia', () => {
  const respond = (resp) => async () => resp;

  it('passes the path and body to the upload API and returns the content URL', async () => {
    const calls = [];
    const body = new Blob(['x']);
    const upload = async (path, init) => {
      calls.push([path, init]);
      return { ok: true, status: 201, json: async () => ({ source: { contentUrl: './media_abc.png' } }) };
    };
    const result = await uploadMedia({ path: '/example/site/.index/a.png', body, upload });
    expect(result).to.deep.equal({ href: './media_abc.png' });
    expect(calls).to.deep.equal([['/example/site/.index/a.png', { body }]]);
  });

  it('reports a failed response with its status', async () => {
    expect(await uploadMedia({ path: '/p', body: '', upload: respond({ ok: false, status: 403 }) }))
      .to.deep.equal({ error: 'Upload failed with status 403.', status: 403 });
    expect(await uploadMedia({ path: '/p', body: '', upload: respond(undefined) }))
      .to.deep.equal({ error: 'Upload failed with status unknown.', status: undefined });
  });

  it('reports a response without a usable content URL', async () => {
    const error = 'The upload did not return a usable file URL.';
    const noUrl = { ok: true, status: 201, json: async () => ({ source: {} }) };
    const badJson = { ok: true, status: 201, json: async () => { throw new Error('bad json'); } };
    expect(await uploadMedia({ path: '/p', body: '', upload: respond(noUrl) }))
      .to.deep.equal({ error, status: 201 });
    expect(await uploadMedia({ path: '/p', body: '', upload: respond(badJson) }))
      .to.deep.equal({ error, status: 201 });
  });
});

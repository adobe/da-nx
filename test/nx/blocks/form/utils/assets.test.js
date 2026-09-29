import { expect } from '@esm-bundle/chai';
import {
  createMediaPath,
  imagePreviewHref,
  mediaPreviewOrigin,
  openMediaPreview,
  selectImageSource,
  uploadImage,
} from '../../../../../nx/blocks/form/utils/assets.js';
import { DA_CONTENT } from '../../../../../nx2/utils/utils.js';

const details = {
  owner: 'example',
  repo: 'site',
  fullpath: '/example/site/forms/sample.html',
};

const image = (type = 'image/png') => new File(
  [new Uint8Array(12)],
  'hero.png',
  { type },
);

describe('form image preview URL', () => {
  const previewOrigin = 'https://main--site--example.preview.da.live';

  it('resolves Media Bus references against the site preview origin, as Canvas does', () => {
    expect(imagePreviewHref({ href: './media_abc.png', previewOrigin }))
      .to.equal(`${previewOrigin}/media_abc.png`);
  });

  it('waits for the preview origin before resolving Media Bus references', () => {
    expect(imagePreviewHref({ href: './media_abc.png' })).to.equal('');
  });

  it('keeps AEM Assets delivery URLs without rewriting them', () => {
    const href = 'https://delivery.example.com/photo.png?smartcrop=wide&width=1920';
    expect(imagePreviewHref({ href, previewOrigin })).to.equal(href);
  });

  it('previews legacy DA uploads from their stored content URL', () => {
    const href = 'https://content.da.live/example/site/forms/.sample/hero.png';
    expect(imagePreviewHref({ href, previewOrigin })).to.equal(href);
  });

  it('refuses unsafe protocols or unrelated relative paths', () => {
    expect(imagePreviewHref({ href: 'file:///private/image.png', previewOrigin })).to.equal('');
    expect(imagePreviewHref({ href: 'data:text/html,example', previewOrigin })).to.equal('');
    expect(imagePreviewHref({ href: '../other-image.jpg', previewOrigin })).to.equal('');
  });
});

describe('form media preview login', () => {
  it('logs into the preview and content origins once per site with the IMS token', async () => {
    const calls = [];
    const request = async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true };
    };
    const getToken = async () => 'token';
    const origin = await openMediaPreview({
      owner: 'example', repo: 'login-once', getToken, request,
    });
    await openMediaPreview({
      owner: 'example', repo: 'login-once', getToken, request,
    });
    expect(origin).to.equal(mediaPreviewOrigin({ owner: 'example', repo: 'login-once' }));
    expect(calls.map(({ url }) => url)).to.deep.equal([
      `${origin}/gimme_cookie`,
      `${DA_CONTENT}/example/login-once/.gimme_cookie`,
    ]);
    expect(calls.every(({ opts }) => opts.credentials === 'include')).to.be.true;
  });

  it('still returns the origin and retries later when either login fails', async () => {
    let attempts = 0;
    const request = async (url) => {
      attempts += 1;
      return { ok: !url.includes('/.gimme_cookie') };
    };
    const getToken = async () => 'token';
    const options = {
      owner: 'example', repo: 'login-retry', getToken, request,
    };
    expect(await openMediaPreview(options)).to.equal(mediaPreviewOrigin(options));
    await openMediaPreview(options);
    expect(attempts).to.equal(4);
  });

  it('skips the login for anonymous users', async () => {
    let attempts = 0;
    await openMediaPreview({
      owner: 'example',
      repo: 'anonymous',
      getToken: async () => undefined,
      request: async () => { attempts += 1; },
    });
    expect(attempts).to.equal(0);
  });
});

describe('form image asset operations', () => {
  it('does not upload when the file picker is canceled', async () => {
    let uploadCalls = 0;
    const result = await selectImageSource({
      details,
      chooseFile: async () => null,
      upload: async () => { uploadCalls += 1; },
    });
    expect(result).to.deep.equal({ cancelled: true });
    expect(uploadCalls).to.equal(0);
  });

  it('passes a chosen image into the same upload API boundary', async () => {
    const file = image();
    const result = await selectImageSource({
      details,
      chooseFile: async () => file,
      upload: async ({ file: selectedFile }) => {
        expect(selectedFile).to.equal(file);
        return { href: './media_abc.png', name: file.name };
      },
    });
    expect(result.href).to.equal('./media_abc.png');
  });

  it('uses the same document-scoped media folder as canvas', () => {
    expect(createMediaPath({ details, fileName: 'hero.png' }))
      .to.equal('/forms/.sample/hero.png');
  });

  it('rejects malformed file names before constructing a source path', () => {
    expect(() => createMediaPath({ details, fileName: '../other.png' })).to.throw();
    expect(() => createMediaPath({ details, fileName: 'other/path.png' })).to.throw();
  });

  it('saves the returned Media Bus URL without rewriting it', async () => {
    const calls = [];
    const result = await uploadImage({
      details,
      file: image(),
      upload: async (options) => {
        calls.push(options);
        return { ok: true, json: async () => ({ source: { contentUrl: './media_abc.png' } }) };
      },
    });
    expect(calls).to.have.lengthOf(1);
    expect(calls[0]).to.include({
      org: 'example',
      site: 'site',
      path: '/forms/.sample/hero.png',
    });
    expect(calls[0].body).to.be.instanceOf(File);
    expect(result).to.deep.equal({ href: './media_abc.png', name: 'hero.png' });
  });

  it('preserves legacy DA source URLs', async () => {
    const href = 'https://content.da.live/example/site/forms/.sample/hero.png';
    const result = await uploadImage({
      details,
      file: image(),
      upload: async () => ({
        ok: true,
        json: async () => ({ source: { contentUrl: href } }),
      }),
    });
    expect(result.href).to.equal(href);
  });

  it('rejects unsupported types before uploading', async () => {
    let uploadCalls = 0;
    const upload = async () => { uploadCalls += 1; };
    try {
      await uploadImage({ details, file: image('application/pdf'), upload });
      throw new Error('Unsupported file should fail.');
    } catch (error) {
      expect(error.message).to.include('SVG, PNG, JPEG, or GIF');
    }
    expect(uploadCalls).to.equal(0);
  });

  it('surfaces failed uploads and missing content URLs', async () => {
    try {
      await uploadImage({
        details,
        file: image(),
        upload: async () => ({ ok: false, status: 403 }),
      });
      throw new Error('Failed upload should not succeed.');
    } catch (error) {
      expect(error.message).to.include('403');
    }
    try {
      await uploadImage({
        details,
        file: image(),
        upload: async () => ({ ok: true, json: async () => ({ source: {} }) }),
      });
      throw new Error('Missing URL should not succeed.');
    } catch (error) {
      expect(error.message).to.include('image URL');
    }
  });
});

import { expect } from '@esm-bundle/chai';
import {
  acceptsOnlyImages,
  createAssetSources,
  describeAsset,
  isAssetHref,
  isImageType,
  matchesMediaType,
  previewHrefFor,
  typeFromName,
  uploadableTypes,
  uploadFile,
} from '../../../../../nx/blocks/form/utils/assets.js';

describe('form media types', () => {
  it('accepts any type without a contentMediaType or with */*', () => {
    expect(matchesMediaType({ type: 'audio/mpeg' })).to.be.true;
    expect(matchesMediaType({ type: 'audio/mpeg', contentMediaType: ' */* ' })).to.be.true;
  });

  it('matches exact types and type wildcards, case-insensitively', () => {
    expect(matchesMediaType({ type: 'image/PNG', contentMediaType: 'image/*' })).to.be.true;
    expect(matchesMediaType({ type: 'application/pdf', contentMediaType: 'image/*' })).to.be.false;
    expect(matchesMediaType({ type: 'application/pdf', contentMediaType: 'Application/PDF' })).to.be.true;
    expect(matchesMediaType({ type: '', contentMediaType: 'image/*' })).to.be.false;
  });

  it('uploads only Canvas image types, narrowed by the field', () => {
    expect(uploadableTypes()).to.deep.equal([
      'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif',
    ]);
    expect(uploadableTypes({ contentMediaType: 'image/png' })).to.deep.equal(['image/png']);
    expect(uploadableTypes({ contentMediaType: 'video/*' })).to.deep.equal([]);
    expect(uploadableTypes({ contentMediaType: 'audio/*' })).to.deep.equal([]);
  });

  it('derives known types from file names', () => {
    expect(typeFromName('photo.JPG')).to.equal('image/jpeg');
    expect(typeFromName('media_abc.png')).to.equal('image/png');
    expect(typeFromName('play')).to.equal('');
    expect(typeFromName(undefined)).to.equal('');
  });

  it('treats every image type as an image and only image types as image-only fields', () => {
    expect(isImageType('image/webp')).to.be.true;
    expect(isImageType('video/mp4')).to.be.false;
    expect(acceptsOnlyImages({ contentMediaType: 'image/*' })).to.be.true;
    expect(acceptsOnlyImages({ contentMediaType: '*/*' })).to.be.false;
    expect(acceptsOnlyImages()).to.be.false;
  });
});

const previewOrigin = 'https://main--site--example.preview.da.live';

describe('form asset values', () => {
  it('accepts Media Bus references and web URLs only', () => {
    expect(isAssetHref('./media_abc.png')).to.be.true;
    expect(isAssetHref('https://content.da.live/example/site/a.pdf')).to.be.true;
    expect(isAssetHref('./media_a b.png')).to.be.false;
    expect(isAssetHref('file:///private/image.png')).to.be.false;
    expect(isAssetHref('data:text/html,example')).to.be.false;
    expect(isAssetHref('../other-image.jpg')).to.be.false;
    expect(isAssetHref('')).to.be.false;
  });

  it('resolves Media Bus references against the site preview origin, as Canvas does', () => {
    expect(previewHrefFor({ href: './media_abc.png', previewOrigin }))
      .to.equal(`${previewOrigin}/media_abc.png`);
    expect(previewHrefFor({ href: './media_abc.png' })).to.equal(undefined);
  });

  it('keeps AEM Assets and legacy DA URLs as they are', () => {
    const delivery = 'https://delivery.example.com/photo.png?smartcrop=wide&width=1920';
    const legacy = 'https://content.da.live/example/site/forms/.sample/hero.png';
    expect(previewHrefFor({ href: delivery, previewOrigin })).to.equal(delivery);
    expect(previewHrefFor({ href: legacy, previewOrigin })).to.equal(legacy);
  });

  it('refuses hrefs that are not file references', () => {
    expect(previewHrefFor({ href: 'data:text/html,example', previewOrigin })).to.equal(undefined);
  });

  it('names a stored value after the decoded last path segment', () => {
    expect(describeAsset({ href: 'https://x.test/a/data%20sheet.pdf?x=1' }).name).to.equal('data sheet.pdf');
    expect(describeAsset({ href: './media_abc.png' }).name).to.equal('media_abc.png');
    expect(describeAsset({ href: 'https://x.test/%E0%A4%A' }).name).to.equal('%E0%A4%A');
  });

  it('describes a stored value from its name and the field type', () => {
    expect(describeAsset({ href: 'https://x.test/spec.pdf', contentMediaType: 'image/*' }))
      .to.deep.equal({ name: 'spec.pdf', isAllowed: false, isImage: false });
    expect(describeAsset({ href: 'https://x.test/photo.avif', contentMediaType: 'image/*' }))
      .to.deep.equal({ name: 'photo.avif', isAllowed: true, isImage: true });
  });

  it('prefers the name and type of a file picked in this session', () => {
    expect(describeAsset({
      href: 'https://delivery.example.com/urn:aaid:aem:1/as/photo',
      name: 'photo.webp',
      type: 'image/webp',
    })).to.deep.equal({ name: 'photo.webp', isAllowed: true, isImage: true });
  });
});

const ERRORS = {
  document: 'The form document path is unavailable for upload.',
  fileName: 'The file name is invalid.',
  fileType: 'This file type cannot be uploaded here.',
  response: 'The upload did not return a usable file URL.',
};

const details = {
  owner: 'example', repo: 'site', parent: '/example/site/forms', name: 'sample',
};

const fileOf = ({ name, type = '' }) => new File([new Uint8Array(4)], name, { type });

const respondWith = (contentUrl) => async () => ({
  ok: true,
  json: async () => ({ source: { contentUrl } }),
});

describe('form file upload', () => {
  it('uses the same document-scoped folder as Canvas, also for root documents', async () => {
    const paths = [];
    const upload = async (path) => {
      paths.push(path);
      return respondWith('./media_abc.png')();
    };
    const file = fileOf({ name: 'a.png' });
    await uploadFile({ details, file, upload });
    await uploadFile({ details: { ...details, parent: '/example/site', name: 'index' }, file, upload });
    expect(paths).to.deep.equal(['/example/site/forms/.sample/a.png', '/example/site/.index/a.png']);
  });

  it('rejects malformed file names and document paths before uploading', async () => {
    const upload = async () => { throw new Error('Should not upload.'); };
    expect(await uploadFile({ details, file: fileOf({ name: 'a?b.png' }), upload }))
      .to.deep.equal({ error: ERRORS.fileName });
    expect(await uploadFile({ details, file: fileOf({ name: 'a#b.png' }), upload }))
      .to.deep.equal({ error: ERRORS.fileName });
    expect(await uploadFile({
      details: { ...details, parent: undefined }, file: fileOf({ name: 'a.png' }), upload,
    })).to.deep.equal({ error: ERRORS.document });
  });

  it('uploads to the document folder and keeps the returned Media Bus URL', async () => {
    const calls = [];
    const upload = async (path, { body }) => {
      calls.push({ path, body });
      return respondWith('./media_abc.png')();
    };
    const file = fileOf({ name: 'hero.png' });
    const result = await uploadFile({ details, file, upload });
    expect(calls).to.deep.equal([{ path: '/example/site/forms/.sample/hero.png', body: file }]);
    expect(result).to.deep.equal({ href: './media_abc.png', name: 'hero.png', type: 'image/png' });
  });

  it('accepts both JPEG extensions', async () => {
    const upload = respondWith('./media_abc.jpg');
    const jpg = await uploadFile({ details, file: fileOf({ name: 'hero.jpg' }), upload });
    const jpeg = await uploadFile({ details, file: fileOf({ name: 'hero.jpeg' }), upload });
    expect(jpg.type).to.equal('image/jpeg');
    expect(jpeg.type).to.equal('image/jpeg');
  });

  it('validates by extension, like the upload API, and rejects types the field does not take', async () => {
    let uploads = 0;
    const upload = async () => {
      uploads += 1;
      return respondWith('./media_abc.png')();
    };
    const rejected = [
      { file: fileOf({ name: 'song.mp3', type: 'audio/mpeg' }) },
      { file: fileOf({ name: 'clip.mp4', type: 'video/mp4' }) },
      { file: fileOf({ name: 'spec.pdf', type: 'application/pdf' }) },
      { file: fileOf({ name: 'photo.webp', type: 'image/webp' }) },
      { file: fileOf({ name: 'photo.png', type: 'image/png' }), contentMediaType: 'application/pdf' },
      { file: fileOf({ name: 'renamed.txt', type: 'image/png' }) },
    ];
    const results = await Promise.all(rejected.map(({ file, contentMediaType }) => uploadFile({
      details, file, contentMediaType, upload,
    })));
    results.forEach((result) => expect(result).to.deep.equal({ error: ERRORS.fileType }));
    expect(uploads).to.equal(0);
  });

  it('reports failed uploads and unusable URLs', async () => {
    const file = fileOf({ name: 'hero.png' });
    expect(await uploadFile({ details, file, upload: async () => ({ ok: false, status: 403 }) }))
      .to.deep.equal({ error: 'Upload failed with status 403.' });
    expect(await uploadFile({ details, file, upload: respondWith(undefined) }))
      .to.deep.equal({ error: ERRORS.response });
  });

  it('applies the Canvas size limits before uploading', async () => {
    const MB = 1_000_000;
    const sized = (size) => ({ name: 'hero.png', size });
    const upload = respondWith('./media_abc.png');
    const probes = [];
    const site = ({ hlx6 }) => async (org, repo) => {
      probes.push({ org, repo });
      return hlx6;
    };
    const legacy = site({ hlx6: false });

    expect(await uploadFile({ details, file: sized(4.5 * MB), upload, checkHlx6: legacy }))
      .to.have.property('href');
    expect(probes).to.deep.equal([]);
    expect(await uploadFile({ details, file: sized(5 * MB), upload, checkHlx6: legacy }))
      .to.have.property('href');
    expect(probes).to.deep.equal([{ org: 'example', repo: 'site' }]);
    expect(await uploadFile({ details, file: sized(20 * MB + 1), upload, checkHlx6: legacy }))
      .to.deep.equal({ error: 'Max image size allowed is 20 MB' });
    expect(await uploadFile({
      details, file: sized(5 * MB), upload, checkHlx6: site({ hlx6: true }),
    })).to.deep.equal({ error: 'Max image size allowed is 4.5 MB' });
    expect(await uploadFile({
      details, file: sized(5 * MB), upload, checkHlx6: async () => { throw new Error('offline'); },
    })).to.have.property('href');
  });
});

const REPO_CONFIG = { repositoryId: 'author-p1-e1.adobeaemcloud.com', tierType: 'author' };

const isCurrent = () => true;
const labelsOf = (sources) => sources.map(({ id, label }) => ({ id, label }));

describe('form asset sources', () => {
  it('offers only Upload without an AEM repository', () => {
    expect(labelsOf(createAssetSources({ details, isCurrent }))).to.deep.equal([
      { id: 'upload', label: 'Upload' },
    ]);
  });

  it('adds AEM Assets when the site has a repository', () => {
    const sources = createAssetSources({ details, repoConfig: REPO_CONFIG, isCurrent });
    expect(labelsOf(sources)).to.deep.equal([
      { id: 'upload', label: 'Upload' },
      { id: 'aem-assets', label: 'AEM Assets' },
    ]);
  });

  it('lets Upload accept only fields with an uploadable type', () => {
    const [upload] = createAssetSources({ details, isCurrent });
    expect(upload.accepts({ contentMediaType: 'image/*' })).to.be.true;
    expect(upload.accepts({ contentMediaType: 'application/pdf' })).to.be.false;
    expect(upload.accepts({ contentMediaType: 'audio/*' })).to.be.false;
    expect(upload.localFileTypes({ contentMediaType: 'image/*' }))
      .to.deep.equal(['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif']);
  });

  it('lets AEM Assets accept any field', () => {
    const [, aem] = createAssetSources({ details, repoConfig: REPO_CONFIG, isCurrent });
    expect(aem.accepts({ contentMediaType: 'audio/*' })).to.be.true;
    expect(aem.localFileTypes).to.equal(undefined);
  });

  it('cancels a result that arrives after the document changed', async () => {
    let current = true;
    const [upload] = createAssetSources({ details, isCurrent: () => current });
    const file = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });
    const pending = upload.select({ file });
    current = false;
    expect(await pending).to.deep.equal({ cancelled: true });
  });
});

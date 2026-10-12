import { expect } from '@esm-bundle/chai';
import { describeMedia, isAssetHref, isLinkedMedia } from '../../../../../nx/blocks/form/utils/media.js';

const previewOrigin = 'https://main--site--example.preview.da.live';

describe('form media values', () => {
  it('accepts Media Bus references and web URLs only', () => {
    expect(isAssetHref('./media_abc.png')).to.be.true;
    expect(isAssetHref('https://content.da.live/example/site/a.pdf')).to.be.true;
    expect(isAssetHref('./media_a b.png')).to.be.false;
    expect(isAssetHref('file:///private/image.png')).to.be.false;
    expect(isAssetHref('data:text/html,example')).to.be.false;
    expect(isAssetHref('../other-image.jpg')).to.be.false;
    expect(isAssetHref('')).to.be.false;
  });

  it('previews Media Bus images against the site preview origin, as Canvas does', () => {
    expect(describeMedia({ href: './media_abc.png', previewOrigin }).previewHref)
      .to.equal(`${previewOrigin}/media_abc.png`);
    expect(describeMedia({ href: './media_abc.png' }).previewHref).to.equal(undefined);
  });

  it('previews AEM Assets and legacy DA images from their own URL', () => {
    const delivery = 'https://delivery.example.com/photo.png?smartcrop=wide&width=1920';
    const legacy = 'https://content.da.live/example/site/forms/.sample/hero.png';
    expect(describeMedia({ href: delivery, previewOrigin }).previewHref).to.equal(delivery);
    expect(describeMedia({ href: legacy, previewOrigin }).previewHref).to.equal(legacy);
  });

  it('describes values that are not file references as an empty file', () => {
    expect(describeMedia({ href: 'data:text/html,example', previewOrigin }))
      .to.deep.equal({ name: '', kind: 'file', previewHref: undefined });
    expect(describeMedia({ href: undefined }))
      .to.deep.equal({ name: '', kind: 'file', previewHref: undefined });
  });

  it('names a stored value after the decoded last path segment', () => {
    expect(describeMedia({ href: 'https://x.test/a/data%20sheet.pdf?x=1' }).name).to.equal('data sheet.pdf');
    expect(describeMedia({ href: './media_abc.png' }).name).to.equal('media_abc.png');
    expect(describeMedia({ href: 'https://x.test/%E0%A4%A' }).name).to.equal('%E0%A4%A');
  });

  it('detects images the same way the SDK saves them', () => {
    expect(describeMedia({ href: 'https://x.test/photo.png' }).kind).to.equal('image');
    expect(describeMedia({ href: 'https://images.example.com/photo-1.jpg?w=750' }).kind).to.equal('image');
    expect(describeMedia({ href: 'https://images.example.com/photo-1?w=750' }).kind).to.equal('file');
    expect(describeMedia({ href: 'https://x.test/spec.pdf' }))
      .to.deep.equal({ name: 'spec.pdf', kind: 'file', previewHref: undefined });
    expect(describeMedia({ href: 'https://x.test/theme.mp3' }).kind).to.equal('file');
  });

  it('previews videos from their first frame', () => {
    const video = 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/biker%20video.mp4';
    expect(describeMedia({ href: video })).to.deep.equal({
      name: 'biker video.mp4',
      kind: 'video',
      previewHref: `${video}#t=0.1`,
    });
    expect(describeMedia({ href: 'https://cdn.example.com/a/clip.MOV?token=1#start' }))
      .to.deep.equal({ name: 'clip.MOV', kind: 'video', previewHref: 'https://cdn.example.com/a/clip.MOV?token=1#t=0.1' });
    expect(describeMedia({ href: 'https://cdn.example.com/a/clip.webm' }).kind).to.equal('file');
    expect(describeMedia({ href: './media_abc.mp4', previewOrigin }).previewHref)
      .to.equal(`${previewOrigin}/media_abc.mp4#t=0.1`);
  });

  it('describes AEM delivery video players as files, since they have no extension', () => {
    const player = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/play';
    expect(describeMedia({ href: player, name: 'clip.mp4' }))
      .to.deep.equal({ name: 'clip.mp4', kind: 'file', previewHref: undefined });
  });

  it('prefers the name of a file picked in this session, but judges the kind by the URL', () => {
    expect(describeMedia({
      href: 'https://delivery.example.com/urn:aaid:aem:1/as/photo',
      name: 'photo.webp',
    })).to.include({ name: 'photo.webp', kind: 'file' });
  });
});

describe('AEM Assets link mode', () => {
  const repoConfig = { insertAsLink: true, assetOrigin: 'publish-p1-e1.adobeaemcloud.com' };
  const hero = 'https://publish-p1-e1.adobeaemcloud.com/content/dam/hero.jpg';

  it('links media from the site AEM asset host when link mode is on', () => {
    expect(isLinkedMedia({ src: hero, repoConfig })).to.be.true;
    expect(isLinkedMedia({ src: hero.replace('publish-p1', 'PUBLISH-P1'), repoConfig })).to.be.true;
  });

  it('keeps everything else as images', () => {
    const linkModeOff = { ...repoConfig, insertAsLink: false };
    expect(isLinkedMedia({ src: hero, repoConfig: linkModeOff })).to.be.false;
    expect(isLinkedMedia({ src: hero, repoConfig: undefined })).to.be.false;
    expect(isLinkedMedia({ src: 'https://content.da.live/org/site/logo.png', repoConfig })).to.be.false;
    expect(isLinkedMedia({ src: './media_abc.png', repoConfig })).to.be.false;
    expect(isLinkedMedia({ src: 'https://publish-p1-e1.adobeaemcloud.com.evil.test/a.jpg', repoConfig }))
      .to.be.false;
  });
});

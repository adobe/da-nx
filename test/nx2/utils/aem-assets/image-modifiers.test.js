import { expect } from '@esm-bundle/chai';
import { applySiteImageModifiers, parseSiteImageModifiers } from '../../../../nx2/utils/aem-assets/image-modifiers.js';

const DELIVERY_IMAGE = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:img-001/as/photo.avif';

describe('parseSiteImageModifiers', () => {
  it('returns null for non-string or blank values', () => {
    expect(parseSiteImageModifiers(undefined)).to.equal(null);
    expect(parseSiteImageModifiers(42)).to.equal(null);
    expect(parseSiteImageModifiers('   ')).to.equal(null);
    expect(parseSiteImageModifiers('?')).to.equal(null);
  });

  it('trims whitespace and a leading question mark', () => {
    expect(parseSiteImageModifiers('  ?width=1200&quality=80 ')).to.equal('width=1200&quality=80');
  });
});

describe('applySiteImageModifiers', () => {
  it('returns the input when the URL or modifiers are missing', () => {
    expect(applySiteImageModifiers('', 'width=1')).to.equal('');
    expect(applySiteImageModifiers(DELIVERY_IMAGE, null)).to.equal(DELIVERY_IMAGE);
  });

  it('returns the input for an unparsable URL', () => {
    expect(applySiteImageModifiers('not a url', 'width=1')).to.equal('not a url');
  });

  it('appends modifiers to AEM Assets delivery image URLs', () => {
    const params = new URL(applySiteImageModifiers(DELIVERY_IMAGE, 'width=1200&quality=80')).searchParams;
    expect(params.get('width')).to.equal('1200');
    expect(params.get('quality')).to.equal('80');
  });

  it('keeps existing query params over site modifiers', () => {
    const url = applySiteImageModifiers(`${DELIVERY_IMAGE}?width=300`, 'width=1200&quality=80');
    const params = new URL(url).searchParams;
    expect(params.get('width')).to.equal('300');
    expect(params.get('quality')).to.equal('80');
  });

  it('returns the input unchanged when every modifier is already present', () => {
    const src = `${DELIVERY_IMAGE}?width=300`;
    expect(applySiteImageModifiers(src, 'width=1200')).to.equal(src);
  });

  it('ignores non-image, video and non-Open-API URLs', () => {
    const pdf = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:pdf-001/original/as/doc.pdf';
    const video = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:vid-001/play';
    const publish = 'https://publish-p1-e1.adobeaemcloud.com/content/dam/photo.jpg';
    expect(applySiteImageModifiers(pdf, 'width=1')).to.equal(pdf);
    expect(applySiteImageModifiers(video, 'width=1')).to.equal(video);
    expect(applySiteImageModifiers(publish, 'width=1')).to.equal(publish);
  });
});

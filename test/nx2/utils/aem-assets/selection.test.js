import { expect } from '@esm-bundle/chai';
import {
  DM_ERROR_MSG,
  MISSING_FORMAT_ERROR_MSG,
  PUBLISH_ERROR_MSG,
  resolveAssetSelection,
  resolveAssetUrl,
} from '../../../../nx2/utils/aem-assets/selection.js';

// Base repo configs for the three modes
const AUTHOR_PUBLISH_CONFIG = {
  repositoryId: 'author-p1-e1.adobeaemcloud.com',
  tierType: 'author',
  assetOrigin: 'publish-p1-e1.adobeaemcloud.com',
  assetBasePath: '/adobe/assets',
  isDmEnabled: false,
  isSmartCrop: false,
  insertAsLink: false,
};

const AUTHOR_DM_CONFIG = {
  repositoryId: 'author-p1-e1.adobeaemcloud.com',
  tierType: 'author',
  assetOrigin: 'delivery-p1-e1.adobeaemcloud.com',
  assetBasePath: '/adobe/assets',
  isDmEnabled: true,
  isSmartCrop: false,
  insertAsLink: false,
};

const DELIVERY_CONFIG = {
  repositoryId: 'delivery-p1-e1.adobeaemcloud.com',
  tierType: 'delivery',
  assetOrigin: 'delivery-p1-e1.adobeaemcloud.com',
  assetBasePath: '/adobe/assets',
  isDmEnabled: true,
  isSmartCrop: false,
  insertAsLink: false,
};

describe('resolveAssetUrl', () => {
  const AUTHOR_IMAGE = {
    name: 'photo.jpg',
    path: '/content/dam/photo.jpg',
    mimetype: 'image/jpeg',
    'repo:id': 'urn:aaid:aem:img-001',
    _links: {},
  };
  const DELIVERY_IMAGE = {
    'repo:assetId': 'urn:aaid:aem:del-001',
    'repo:name': 'photo.jpg',
    'repo:repositoryId': 'delivery-p1-e1.adobeaemcloud.com',
    'dc:format': 'image/jpeg',
  };

  it('uses buildAuthorUrl for author+publish mode', () => {
    const url = resolveAssetUrl(AUTHOR_IMAGE, AUTHOR_PUBLISH_CONFIG);
    expect(url).to.equal('https://publish-p1-e1.adobeaemcloud.com/content/dam/photo.jpg');
  });

  it('uses buildDmUrl for author+DM mode', () => {
    const url = resolveAssetUrl(AUTHOR_IMAGE, AUTHOR_DM_CONFIG);
    expect(url).to.include('/adobe/assets/urn:aaid:aem:img-001/as/photo.avif');
    expect(url).to.include('delivery-p1-e1.adobeaemcloud.com');
  });

  it('uses buildDeliveryUrl for delivery tier', () => {
    const url = resolveAssetUrl(DELIVERY_IMAGE, DELIVERY_CONFIG);
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-001/as/photo.avif');
  });

  it('respects custom aem.assets.prod.origin for delivery tier', () => {
    const customConfig = { ...DELIVERY_CONFIG, assetOrigin: 'custom-delivery.example.com' };
    const url = resolveAssetUrl(DELIVERY_IMAGE, customConfig);
    expect(url).to.equal('https://custom-delivery.example.com/adobe/assets/urn:aaid:aem:del-001/as/photo.avif');
    expect(url).to.not.include('delivery-p1-e1.adobeaemcloud.com');
  });

  it('respects custom aem.assets.prod.basepath for delivery tier', () => {
    const customConfig = { ...DELIVERY_CONFIG, assetBasePath: '/delivery-assets' };
    const url = resolveAssetUrl(DELIVERY_IMAGE, customConfig);
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/delivery-assets/urn:aaid:aem:del-001/as/photo.avif');
  });

  it('serves image as original in author+DM mode when image/* wildcard is set to original', () => {
    const url = resolveAssetUrl(AUTHOR_IMAGE, {
      ...AUTHOR_DM_CONFIG,
      mimeRenditionOverrides: { 'image/*': 'original' },
    });
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:img-001/original/as/photo.jpg');
  });

  it('serves image as original in delivery tier when image/* wildcard is set to original', () => {
    const url = resolveAssetUrl(DELIVERY_IMAGE, {
      ...DELIVERY_CONFIG,
      mimeRenditionOverrides: { 'image/*': 'original' },
    });
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-001/original/as/photo.jpg');
  });

  it('serves PSD as avif even when image/* wildcard is original (exact match wins)', () => {
    const psdAsset = {
      name: 'design.psd',
      path: '/content/dam/design.psd',
      mimetype: 'application/x-photoshop',
      'repo:id': 'urn:aaid:aem:psd-001',
      _links: {},
    };
    const url = resolveAssetUrl(psdAsset, {
      ...AUTHOR_DM_CONFIG,
      mimeRenditionOverrides: { 'image/*': 'original', 'application/x-photoshop': 'avif' },
    });
    expect(url).to.include('/as/design.avif');
  });

  it('uses mimeRenditionOverrides from repoConfig for specific mime types', () => {
    const docAsset = {
      name: 'report.docx',
      path: '/content/dam/report.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'repo:id': 'urn:aaid:aem:docx-001',
      _links: {},
    };
    const url = resolveAssetUrl(docAsset, {
      ...AUTHOR_DM_CONFIG,
      mimeRenditionOverrides: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'original' },
    });
    expect(url).to.include('/original/as/report.docx');
  });

  it('appends siteImageModifiers to AEM Assets Open API image URLs', () => {
    const url = resolveAssetUrl(DELIVERY_IMAGE, {
      ...DELIVERY_CONFIG,
      siteImageModifiers: 'width=1920&quality=85',
    });
    const params = new URL(url).searchParams;
    expect(params.get('width')).to.equal('1920');
    expect(params.get('quality')).to.equal('85');
  });

  it('does not modify URLs when siteImageModifiers is null/absent', () => {
    const url = resolveAssetUrl(DELIVERY_IMAGE, DELIVERY_CONFIG);
    expect(new URL(url).searchParams.has('width')).to.equal(false);
  });
});

describe('resolveAssetSelection', () => {
  const METADATA_KEY = 'http://ns.adobe.com/adobecloud/rel/metadata/asset';

  const IMAGE_ASSET = {
    'aem:formatName': 'jpeg',
    mimetype: 'image/jpeg',
    name: 'photo.jpg',
    path: '/content/dam/photo.jpg',
    'repo:id': 'urn:aaid:aem:img-001',
    _links: {},
    _embedded: {
      [METADATA_KEY]: {
        'dam:assetStatus': 'approved',
        'dam:activationTarget': 'delivery',
      },
    },
  };

  const PDF_ASSET = {
    ...IMAGE_ASSET,
    'aem:formatName': 'pdf',
    mimetype: 'application/pdf',
    name: 'doc.pdf',
    path: '/content/dam/doc.pdf',
    'repo:id': 'urn:aaid:aem:pdf-001',
  };

  const withMetadata = (metadata) => ({ ...IMAGE_ASSET, _embedded: { [METADATA_KEY]: metadata } });

  it('returns an error when no asset is given', () => {
    const result = resolveAssetSelection({ asset: undefined, repoConfig: AUTHOR_PUBLISH_CONFIG });
    expect(result).to.deep.equal({ error: MISSING_FORMAT_ERROR_MSG });
  });

  it('returns an error when the asset has no aem:formatName', () => {
    const result = resolveAssetSelection({ asset: { mimetype: 'image/jpeg' }, repoConfig: AUTHOR_PUBLISH_CONFIG });
    expect(result).to.deep.equal({ error: MISSING_FORMAT_ERROR_MSG });
  });

  it('resolves a standard image in author+publish mode', () => {
    const result = resolveAssetSelection({ asset: IMAGE_ASSET, repoConfig: AUTHOR_PUBLISH_CONFIG });
    expect(result).to.deep.equal({
      href: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/photo.jpg',
      isImage: true,
      alt: 'photo.jpg',
    });
  });

  it('marks non-image assets as not images', () => {
    const result = resolveAssetSelection({ asset: PDF_ASSET, repoConfig: AUTHOR_PUBLISH_CONFIG });
    expect(result.isImage).to.equal(false);
    expect(result.href).to.equal('https://publish-p1-e1.adobeaemcloud.com/content/dam/doc.pdf');
  });

  it('prefers accessibility metadata for alt text', () => {
    const asset = withMetadata({
      'dam:assetStatus': 'approved',
      'Iptc4xmpExt:ExtDescrAccessibility': 'A sample description',
    });
    const result = resolveAssetSelection({ asset, repoConfig: AUTHOR_PUBLISH_CONFIG });
    expect(result.alt).to.equal('A sample description');
  });

  it('returns the DM error for an unapproved asset in author+DM mode', () => {
    const asset = withMetadata({ 'dam:assetStatus': 'draft', 'dam:activationTarget': 'author' });
    const result = resolveAssetSelection({ asset, repoConfig: AUTHOR_DM_CONFIG });
    expect(result).to.deep.equal({ error: DM_ERROR_MSG });
  });

  it('returns the DM error when approved but activationTarget is not delivery', () => {
    const asset = withMetadata({ 'dam:assetStatus': 'approved', 'dam:activationTarget': 'author' });
    const result = resolveAssetSelection({ asset, repoConfig: AUTHOR_DM_CONFIG });
    expect(result).to.deep.equal({ error: DM_ERROR_MSG });
  });

  it('allows an approved asset with undefined activationTarget in author+DM mode', () => {
    const asset = withMetadata({ 'dam:assetStatus': 'approved' });
    const result = resolveAssetSelection({ asset, repoConfig: AUTHOR_DM_CONFIG });
    expect(result.error).to.equal(undefined);
    expect(result.href).to.include('/adobe/assets/urn:aaid:aem:img-001/as/photo.avif');
  });

  it('allows an approved+delivery asset in author+DM mode', () => {
    const result = resolveAssetSelection({ asset: IMAGE_ASSET, repoConfig: AUTHOR_DM_CONFIG });
    expect(result.error).to.equal(undefined);
  });

  it('returns the publish error for an unpublished asset in author+publish mode', () => {
    const asset = { ...IMAGE_ASSET, 'aem:published': false };
    const result = resolveAssetSelection({ asset, repoConfig: AUTHOR_PUBLISH_CONFIG });
    expect(result).to.deep.equal({ error: PUBLISH_ERROR_MSG });
    expect(result.error).to.include('not available on the publish tier');
  });

  it('returns the publish error for an unpublished non-image asset in author+publish mode', () => {
    const asset = { ...PDF_ASSET, 'aem:published': false };
    const result = resolveAssetSelection({ asset, repoConfig: AUTHOR_PUBLISH_CONFIG });
    expect(result).to.deep.equal({ error: PUBLISH_ERROR_MSG });
  });

  it('allows a published asset in author+publish mode', () => {
    const asset = { ...IMAGE_ASSET, 'aem:published': true };
    const result = resolveAssetSelection({ asset, repoConfig: AUTHOR_PUBLISH_CONFIG });
    expect(result.error).to.equal(undefined);
  });

  it('allows an asset without aem:published in author+publish mode', () => {
    const result = resolveAssetSelection({ asset: IMAGE_ASSET, repoConfig: AUTHOR_PUBLISH_CONFIG });
    expect(result.error).to.equal(undefined);
  });

  it('ignores scene7FileStatus for a published asset in author+publish mode', () => {
    const asset = { ...IMAGE_ASSET, 'aem:published': true, 'repo:scene7FileStatus': 'PublishIncomplete' };
    const result = resolveAssetSelection({ asset, repoConfig: AUTHOR_PUBLISH_CONFIG });
    expect(result.error).to.equal(undefined);
  });

  it('does not check aem:published in author+DM mode', () => {
    const asset = { ...IMAGE_ASSET, 'aem:published': false };
    const result = resolveAssetSelection({ asset, repoConfig: AUTHOR_DM_CONFIG });
    expect(result.error).to.equal(undefined);
  });

  it('does not check approval for delivery tier assets', () => {
    const asset = {
      'aem:formatName': 'jpeg',
      'dc:format': 'image/jpeg',
      'repo:assetId': 'urn:aaid:aem:del-001',
      'repo:name': 'photo.jpg',
      'repo:repositoryId': 'delivery-p1-e1.adobeaemcloud.com',
    };
    const result = resolveAssetSelection({ asset, repoConfig: DELIVERY_CONFIG });
    expect(result.error).to.equal(undefined);
    expect(result.isImage).to.equal(true);
    expect(result.href).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-001/as/photo.avif');
  });
});

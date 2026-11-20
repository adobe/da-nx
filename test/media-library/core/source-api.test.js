import { expect } from '@esm-bundle/chai';
import {
  getSourceUrl,
  getListUrl,
  toListItems,
  toSaveOptions,
} from '../../../nx/blocks/media-library/core/source-api.js';
import { AEM_API_ORIGIN } from '../../../nx/blocks/media-library/core/constants.js';

const DA = 'https://admin.da.live';

describe('source-api', () => {
  describe('getSourceUrl', () => {
    it('keeps the DA admin source route for legacy sites', () => {
      const url = getSourceUrl({ sourceOrigin: DA, path: '/org/site/.da/media-insights/index-meta.json' });
      expect(url).to.equal('https://admin.da.live/source/org/site/.da/media-insights/index-meta.json');
    });

    it('maps to the source bus for Helix 6 sites', () => {
      const url = getSourceUrl({ sourceOrigin: AEM_API_ORIGIN, path: '/org/site/.da/media-insights/index-meta.json' });
      expect(url).to.equal('https://api.aem.live/org/sites/site/source/.da/media-insights/index-meta.json');
    });

    it('maps a site root to the source bus root', () => {
      expect(getSourceUrl({ sourceOrigin: AEM_API_ORIGIN, path: '/org/site' }))
        .to.equal('https://api.aem.live/org/sites/site/source');
    });
  });

  describe('getListUrl', () => {
    it('keeps the DA admin list route unchanged for legacy sites', () => {
      expect(getListUrl({ sourceOrigin: DA, path: '/org/site/' }))
        .to.equal('https://admin.da.live/list/org/site/');
      expect(getListUrl({ sourceOrigin: DA, path: '/org/site/folder' }))
        .to.equal('https://admin.da.live/list/org/site/folder');
    });

    it('lists a Helix 6 folder with a trailing-slash source GET', () => {
      expect(getListUrl({ sourceOrigin: AEM_API_ORIGIN, path: '/org/site/.da/media-insights' }))
        .to.equal('https://api.aem.live/org/sites/site/source/.da/media-insights/');
    });

    it('lists a Helix 6 site root without a double slash', () => {
      expect(getListUrl({ sourceOrigin: AEM_API_ORIGIN, path: '/org/site/' }))
        .to.equal('https://api.aem.live/org/sites/site/source/');
      expect(getListUrl({ sourceOrigin: AEM_API_ORIGIN, path: '/org/site' }))
        .to.equal('https://api.aem.live/org/sites/site/source/');
    });
  });

  describe('toListItems', () => {
    it('passes legacy DA list bodies through', () => {
      const items = [{ path: '/org/site/a.html', name: 'a', ext: 'html' }];
      expect(toListItems({ sourceOrigin: DA, path: '/org/site', body: items })).to.equal(items);
      expect(toListItems({ sourceOrigin: DA, path: '/org/site', body: { sources: items } })).to.equal(items);
    });

    it('normalizes Helix 6 items to the DA list shape', () => {
      const body = [
        { name: '.props', 'content-type': 'application/json' },
        { name: 'drafts/', 'content-type': 'application/folder' },
        {
          name: 'index-meta.json',
          size: 120,
          'content-type': 'application/json',
          'last-modified': '2026-10-09T10:00:00.000Z',
        },
        {
          name: 'index-000.json',
          size: 5000,
          'content-type': 'application/json',
          'last-modified': '2026-10-09T10:00:01.000Z',
        },
      ];
      const items = toListItems({
        sourceOrigin: AEM_API_ORIGIN,
        path: '/org/site/.da/media-insights/',
        body,
      });
      expect(items).to.deep.equal([
        { name: 'drafts', path: '/org/site/.da/media-insights/drafts' },
        {
          name: 'index-meta',
          ext: 'json',
          path: '/org/site/.da/media-insights/index-meta.json',
          lastModified: Date.parse('2026-10-09T10:00:00.000Z'),
        },
        {
          name: 'index-000',
          ext: 'json',
          path: '/org/site/.da/media-insights/index-000.json',
          lastModified: Date.parse('2026-10-09T10:00:01.000Z'),
        },
      ]);
    });

    it('returns no items for a non-array Helix 6 body', () => {
      expect(toListItems({ sourceOrigin: AEM_API_ORIGIN, path: '/org/site', body: {} })).to.deep.equal([]);
    });
  });

  describe('toSaveOptions', () => {
    const json = JSON.stringify({ data: [{ locked: true }] });

    it('keeps the legacy method and raw body for DA', () => {
      expect(toSaveOptions({ sourceOrigin: DA, json, method: 'PUT' }))
        .to.deep.equal({ method: 'PUT', body: json });
    });

    it('wraps the legacy body in multipart form data when asked', async () => {
      const opts = toSaveOptions({ sourceOrigin: DA, json, method: 'PUT', formData: true });
      expect(opts.method).to.equal('PUT');
      expect(opts.body).to.be.instanceOf(FormData);
      expect(await opts.body.get('data').text()).to.equal(json);
    });

    it('POSTs the raw JSON body to the Helix 6 source bus', () => {
      expect(toSaveOptions({ sourceOrigin: AEM_API_ORIGIN, json, method: 'PUT', formData: true }))
        .to.deep.equal({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        });
    });
  });
});

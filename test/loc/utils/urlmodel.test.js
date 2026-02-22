import sinon from 'sinon';
import { expect } from '@esm-bundle/chai';
import URLModel from '../../../nx/blocks/loc/utils/daUrl.js';

const mockConfig = {
  config: {
    data: [
      { key: 'source.language', value: 'English' },
    ],
  },
  languages: {
    data: [
      { name: 'English', code: 'en', location: '/langstore/en', source: '/' },
      { name: 'French', code: 'fr', location: '/langstore/fr' },
    ],
  },
};

const mockRes = (payload) => Promise.resolve({
  ok: true,
  status: 200,
  json: () => Promise.resolve(payload),
  headers: new Headers(),
});

const originalFetch = window.fetch;

describe('URLModel', () => {
  beforeEach(() => {
    window.fetch = sinon.stub().callsFake(() => mockRes(mockConfig));
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  describe('AEM URLs', () => {
    it('Parses org, site, and paths from an AEM URL', () => {
      const model = new URLModel('https://main--mysite--myorg.aem.live/en/my-page');
      expect(model.org).to.equal('myorg');
      expect(model.site).to.equal('mysite');
      expect(model.supplied.aemAdminPath).to.equal('/en/my-page');
      expect(model.supplied.daPath).to.equal('/en/my-page');
      expect(model.supplied.daAdminPath).to.equal('/en/my-page.html');
    });

    it('Appends index for trailing slash paths', () => {
      const model = new URLModel('https://main--mysite--myorg.aem.live/en/my-page/');
      expect(model.supplied.aemAdminPath).to.equal('/en/my-page/index');
      expect(model.supplied.daPath).to.equal('/en/my-page/index');
      expect(model.supplied.daAdminPath).to.equal('/en/my-page/index.html');
    });
  });

  describe('Snapshot AEM URLs', () => {
    it('Parses snapshot from a 4-segment hostname', () => {
      const model = new URLModel('https://snap1--main--mysite--myorg.aem.reviews/en/my-page');
      expect(model.org).to.equal('myorg');
      expect(model.site).to.equal('mysite');
      expect(model.supplied.snapshot).to.equal('snap1');
      console.log(model.supplied.aemPath, 'AEM PATH');
      expect(model.supplied.aemPath).to.equal('/en/my-page');
      expect(model.supplied.aemAdminPath).to.equal('/.snapshot/snap1/en/my-page');
      expect(model.supplied.daAdminPath).to.equal('/.snapshot/snap1/en/my-page.html');
    });

    it('Has undefined snapshot for non-snapshot AEM URLs', () => {
      const model = new URLModel('https://main--mysite--myorg.aem.live/en/my-page');
      expect(model.supplied.snapshot).to.equal(undefined);
    });
  });

  describe('Snapshot DA URLs', () => {
    it('Parses snapshot from a da.live hash path', () => {
      const model = new URLModel('https://da.live/edit#/myorg/mysite/.snapshot/snap1/en/my-page');
      expect(model.org).to.equal('myorg');
      expect(model.site).to.equal('mysite');
      expect(model.supplied.snapshot).to.equal('snap1');
      expect(model.supplied.aemAdminPath).to.equal('/.snapshot/snap1/en/my-page');
      expect(model.supplied.daPath).to.equal('/.snapshot/snap1/en/my-page');
      expect(model.supplied.daAdminPath).to.equal('/.snapshot/snap1/en/my-page.html');
    });

    it('Has undefined snapshot for non-snapshot DA URLs', () => {
      const model = new URLModel('https://da.live/edit#/myorg/mysite/en/my-page');
      expect(model.supplied.snapshot).to.equal(undefined);
      expect(model.supplied.aemAdminPath).to.equal('/en/my-page');
      expect(model.supplied.daPath).to.equal('/en/my-page');
    });
  });

  describe('JSON AEM URLs', () => {
    it('Keeps .json extension for daAdminPath', () => {
      const model = new URLModel('https://main--mysite--myorg.aem.live/my-data.json');
      expect(model.supplied.aemAdminPath).to.equal('/my-data.json');
      expect(model.supplied.daPath).to.equal('/my-data');
      expect(model.supplied.daAdminPath).to.equal('/my-data.json');
    });
  });

  describe('JSON DA URLs', () => {
    it('Parses sheet view as JSON', () => {
      const model = new URLModel('https://da.live/sheet#/myorg/mysite/my-data');
      expect(model.org).to.equal('myorg');
      expect(model.site).to.equal('mysite');
      expect(model.supplied.daPath).to.equal('/my-data');
      expect(model.supplied.daAdminPath).to.equal('/my-data.json');
    });
  });

  describe('views', () => {
    it('Generates edit and preview views for an AEM URL', () => {
      const model = new URLModel('https://main--mysite--myorg.aem.live/en/my-page');
      expect(model.views.edit).to.equal('https://da.live/edit#/myorg/mysite/en/my-page');
      expect(model.views.preview).to.equal('https://mysite--myorg.aem.page/en/my-page');
      expect(model.views.review).to.equal(undefined);
    });

    it('Generates review view for a snapshot AEM URL', () => {
      const model = new URLModel('https://snap1--main--mysite--myorg.aem.reviews/en/my-page');
      expect(model.views.edit).to.equal('https://da.live/edit#/myorg/mysite/.snapshot/snap1/en/my-page');
      expect(model.views.preview).to.equal('https://mysite--myorg.aem.page/.snapshot/snap1/en/my-page');
      expect(model.views.review).to.equal('https://snap1--mysite--myorg.aem.reviews/en/my-page');
    });

    it('Uses sheet view for JSON files', () => {
      const model = new URLModel('https://main--mysite--myorg.aem.live/my-data.json');
      expect(model.views.edit).to.equal('https://da.live/sheet#/myorg/mysite/my-data');
    });
  });

  describe('getSuppliedPrefix', () => {
    const langs = mockConfig.languages.data;

    it('Finds the matching language prefix', async () => {
      const model = new URLModel('https://main--mysite--myorg.aem.live/langstore/fr/my-page');
      const prefix = model.getSuppliedPrefix(langs);
      expect(prefix).to.equal('/langstore/fr');
    });

    it('Returns empty when no prefix matches', async () => {
      const model = new URLModel('https://main--mysite--myorg.aem.live/some/other/page');
      const prefix = model.getSuppliedPrefix(langs);
      expect(prefix).to.equal('');
    });
  });
});

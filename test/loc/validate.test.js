import { expect } from '@esm-bundle/chai';
import '../../nx/blocks/loc/views/validate/validate.js';
import { getImageAltFragmentUrls, getFragmentUrls } from '../../nx/blocks/loc/views/validate/validate-utils.js';

describe('validate-utils', () => {
  describe('getImageAltFragmentUrls', () => {
    it('extracts fragment URLs from image alt attributes', () => {
      const parser = new DOMParser();
      const html = `
        <html>
          <body>
            <img alt="https://main--site--adobecom.aem.page/fragments/video#xf | Video description | :play-medium:" />
            <img alt="https://main--site--adobecom.aem.page/fragments/banner#xf | Banner description" />
            <img alt="Regular image description" />
          </body>
        </html>
      `;
      const dom = parser.parseFromString(html, 'text/html');
      const urls = getImageAltFragmentUrls(dom);
      expect(urls).to.have.length(2);
      expect(urls[0]).to.include('/fragments/video');
      expect(urls[1]).to.include('/fragments/banner');
    });

    it('returns empty array if no image alts with fragments', () => {
      const parser = new DOMParser();
      const html = '<html><body><img alt="No fragment here" /></body></html>';
      const dom = parser.parseFromString(html, 'text/html');
      const urls = getImageAltFragmentUrls(dom);
      expect(urls).to.have.length(0);
    });
  });

  describe('extractFragmentUrls', () => {
    it('extracts fragment URLs from anchors and image alts', () => {
      const html = `
        <html>
          <body>
            <a href="https://main--site--adobecom.aem.page/fragments/header">Header</a>
            <a href="https://main--site--adobecom.aem.page/fragments/footer">Footer</a>
            <img alt="https://main--site--adobecom.aem.page/fragments/video#xf | Video description" />
            <img alt="Regular image description" />
          </body>
        </html>
      `;
      const urls = getFragmentUrls(html);
      expect(urls).to.include('https://main--site--adobecom.aem.page/fragments/header');
      expect(urls).to.include('https://main--site--adobecom.aem.page/fragments/footer');
      expect(urls).to.include('https://main--site--adobecom.aem.page/fragments/video#xf ');
      expect(urls).to.have.length(3);
    });

    it('returns empty array if no fragments found', () => {
      const html = '<html><body><a href="/not-a-fragment">Not a fragment</a></body></html>';
      const urls = getFragmentUrls(html);
      expect(urls).to.have.length(0);
    });
  });
});

describe('NxLocValidate - source root detection', () => {
  const languages = {
    data: [
      { name: 'Global English', code: 'en', location: '/global', locales: '/na, /eu' },
      { name: 'EU English', code: 'en', location: '/eu', locales: '/en-nl' },
    ],
  };

  function createEl({ detect = 'true', paths }) {
    const el = document.createElement('nx-loc-validate');
    const config = [{ key: 'source.language', value: 'Global English' }];
    if (detect) config.push({ key: 'source.language.detect', value: detect });
    el._configSheet = { config: { data: config }, languages };
    el._urls = paths.map((pathname) => ({ pathname, checked: true, status: 'ready' }));
    return el;
  }

  it('shows an error once URLs are checked when roots are mixed', async () => {
    const el = createEl({ paths: ['/global/a', '/eu/b'] });
    await el.updateSourceMessage();
    expect(el._message.type).to.equal('error');
    expect(el._message.text).to.include('/global');
    expect(el._message.text).to.include('/eu');
  });

  it('clears the error when a URL is unchecked', async () => {
    const el = createEl({ paths: ['/global/a', '/eu/b'] });
    await el.updateSourceMessage();
    el._urls[1].checked = false;
    await el.updateSourceMessage();
    expect(el._message).to.equal(undefined);
  });

  it('blocks Next with the error when roots are mixed', async () => {
    const el = createEl({ paths: ['/global/a', '/eu/b'] });
    const { message, updates } = await el.getUpdates();
    expect(updates).to.equal(undefined);
    expect(message.type).to.equal('error');
  });

  it('strips the detected root from basePath', async () => {
    const el = createEl({ paths: ['/eu/shipping'] });
    const { updates } = await el.getUpdates();
    expect(updates.urls[0].basePath).to.equal('/shipping');
  });

  it('persists the detected root, not the configured default, as sourceLocations', async () => {
    const el = createEl({ paths: ['/eu/shipping'] });
    const { updates } = await el.getUpdates();
    expect(updates.sourceLocations).to.deep.equal(['/eu']);
  });

  it('persists the configured default and row sources when the flag is off', async () => {
    const el = createEl({ detect: '', paths: ['/global/a'] });
    el._configSheet.languages = {
      data: [
        { name: 'Global English', code: 'en', location: '/global' },
        { name: 'Dutch', code: 'nl', location: '/nl', source: '/en-nl' },
      ],
    };
    const { updates } = await el.getUpdates();
    expect(updates.sourceLocations).to.deep.equal(['/global', '/en-nl']);
  });

  it('persists the detected root alongside row sources', async () => {
    const el = createEl({ paths: ['/eu/a', '/eu/b'] });
    el._configSheet.languages = {
      data: [
        { name: 'Global English', code: 'en', location: '/global' },
        { name: 'EU English', code: 'en', location: '/eu' },
        { name: 'Dutch', code: 'nl', location: '/nl', source: '/en-nl' },
      ],
    };
    const { updates } = await el.getUpdates();
    expect(updates.sourceLocations).to.include.members(['/eu', '/en-nl']);
    expect(updates.sourceLocations).to.not.include('/global');
    expect(updates.urls.map((url) => url.basePath)).to.deep.equal(['/a', '/b']);
  });

  it('persists the detected source for later steps', async () => {
    const el = createEl({ paths: ['/eu/shipping'] });
    const { updates } = await el.getUpdates();
    expect(updates.detectedSource).to.deep.equal({ name: 'EU English', code: 'en', location: '/eu' });
  });

  it('persists a null detected source when nothing is detected', async () => {
    const el = createEl({ paths: ['/fragments/header'] });
    const { updates } = await el.getUpdates();
    expect(updates.detectedSource).to.equal(null);
  });

  it('persists a null detected source when the flag is off', async () => {
    const el = createEl({ detect: '', paths: ['/eu/shipping'] });
    const { updates } = await el.getUpdates();
    expect(updates.detectedSource).to.equal(null);
  });

  it('names the URL to uncheck when roots are mixed', async () => {
    const el = createEl({ paths: ['/eu/a', '/eu/b', '/global/fragments/x'] });
    await el.updateSourceMessage();
    expect(el._message.text).to.include('uncheck: /global/fragments/x');
  });

  it('ignores URLs that match no root', async () => {
    const el = createEl({ paths: ['/eu/a', '/fragments/header'] });
    await el.updateSourceMessage();
    expect(el._message).to.equal(undefined);
  });

  it('does nothing when the flag is off', async () => {
    const el = createEl({ detect: '', paths: ['/global/a', '/eu/b'] });
    await el.updateSourceMessage();
    expect(el._message).to.equal(undefined);
    const { updates } = await el.getUpdates();
    expect(updates.urls[0].basePath).to.equal('/a');
    expect(updates.urls[1].basePath).to.equal('/eu/b');
  });
});

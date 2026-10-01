import { expect } from '@esm-bundle/chai';
import {
  convertPath,
  findSourceLocation,
  getSourceLocations,
} from '../../../../nx/blocks/loc/utils/utils.js';
import { calculateView } from '../../../../nx/blocks/loc/utils/steps.js';
import { formatLangUrls } from '../../../../nx/blocks/loc/views/rollout/index.js';
import { getSyncUrls } from '../../../../nx/blocks/loc/views/sync/index.js';

const options = { 'source.language': { name: 'English', location: '/us/en' } };
const langs = [
  { name: 'English', location: '/us/en' },
  { name: 'EMEA German', source: '/emea/en', location: '/emea/de' },
  { name: 'APAC Hindi', source: '/apac/en', location: '/apac/hi' },
];

describe('loc source locations', () => {
  it('collects default and per-language sources without duplicates', () => {
    const locations = getSourceLocations({ options, langs: [...langs, langs[1]] });
    expect(locations).to.deep.equal(['/us/en', '/emea/en', '/apac/en']);
  });

  it('ignores the root location', () => {
    const rootOptions = { 'source.language': { location: '/' } };
    expect(getSourceLocations({ options: rootOptions, langs: [] })).to.deep.equal([]);
  });

  it('finds the longest matching location on a segment boundary', () => {
    const locations = ['/us/en', '/us/en/fragments'];
    expect(findSourceLocation({ path: '/us/en/fragments/nav', locations })).to.equal('/us/en/fragments');
    expect(findSourceLocation({ path: '/us/en/about', locations })).to.equal('/us/en');
    expect(findSourceLocation({ path: '/us/english/about', locations })).to.be.undefined;
    expect(findSourceLocation({ path: '/about', locations })).to.be.undefined;
  });

  describe('sync detection', () => {
    const project = (path) => ({
      view: 'options',
      options,
      langs: langs.map((lang) => ({ ...lang, action: 'translate' })),
      urls: [{ suppliedPath: path }],
    });
    const nextView = (path) => calculateView({
      project: project(path),
      currentView: 'options',
      direction: 'next',
    }).view;

    it('does not sync default-location URLs', () => {
      expect(nextView('/us/en/about/corporate-responsibility')).to.equal('translate');
    });

    it('does not sync URLs under a per-language source', () => {
      expect(nextView('/emea/en/about/page')).to.equal('translate');
    });

    it('still syncs URLs outside every configured location', () => {
      expect(nextView('/about/page')).to.equal('sync');
    });
  });

  describe('sync urls', () => {
    const locations = getSourceLocations({ options, langs });

    it('skips URLs already under a configured source', () => {
      const [url] = getSyncUrls('org', 'site', '/us/en', [{ suppliedPath: '/emea/en/about/page' }], undefined, locations);
      expect(url.synced).to.equal('skipped');
      expect(url.skipSync).to.be.true;
      expect(url.destView).to.equal('/emea/en/about/page');
    });

    it('maps unprefixed URLs into the default location', () => {
      const [url] = getSyncUrls('org', 'site', '/us/en', [{ suppliedPath: '/about/page' }], undefined, locations);
      expect(url.skipSync).to.be.undefined;
      expect(url.destination).to.equal('/org/site/us/en/about/page.html');
    });
  });

  describe('path resolution', () => {
    const resolve = (path, dest) => {
      const locations = getSourceLocations({ options, langs });
      const prefix = findSourceLocation({ path, locations });
      return convertPath({ path, sourcePrefix: prefix, destPrefix: dest }).daDestPath;
    };

    it('resolves default-location URLs as before', () => {
      const path = '/us/en/about/corporate-responsibility';
      expect(resolve(path, '/us/en')).to.equal('/us/en/about/corporate-responsibility.html');
      expect(resolve(path, '/emea/en')).to.equal('/emea/en/about/corporate-responsibility.html');
    });

    it('does not double the per-language source prefix', () => {
      expect(resolve('/emea/en/about/page', '/emea/en')).to.equal('/emea/en/about/page.html');
    });
  });

  describe('rollout sources', () => {
    const locations = getSourceLocations({ options, langs });
    const source = (path, lang) => formatLangUrls('org', 'site', locations, lang, [{ suppliedPath: path }])[0].source;

    it('reads translated content from the language location without doubling the prefix', () => {
      expect(source('/emea/en/about/page', langs[1])).to.equal('/org/site/emea/de/about/page.html');
    });

    it('resolves default-location URLs as before', () => {
      expect(source('/us/en/about/page', langs[1])).to.equal('/org/site/emea/de/about/page.html');
    });
  });
});

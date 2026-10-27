import { expect } from '@esm-bundle/chai';
import {
  resolveSourceLang,
  isSourceDetectEnabled,
  normalizeLocation,
} from '../../nx/blocks/loc/utils/utils.js';

const langs = [
  { name: 'Global English', code: 'en', location: '/global', locales: '/na, /eu, /apac' },
  { name: 'EU English', code: 'en', location: '/eu', locales: '/en-nl, /en-de' },
  { name: 'Dutch', code: 'nl', source: '/en-nl', location: '/nl-nl' },
  { name: 'Spanish', code: 'es', source: '/en-us', location: '/es-us' },
  { name: 'NA English', code: 'en', location: '/na', locales: '/en-us, /en-ca' },
];

const defaultSourceLang = { name: 'Global English', code: 'en', location: '/global' };

describe('resolveSourceLang', () => {
  it('uses the single root all URLs share', () => {
    const { sourceLang, detected } = resolveSourceLang({
      langs,
      urls: ['/eu/shipping', '/eu/rates/ground'],
      defaultSourceLang,
    });
    expect(detected).to.equal(true);
    expect(sourceLang).to.deep.equal({ name: 'EU English', code: 'en', location: '/eu' });
  });

  it('matches the longest root', () => {
    const nested = [...langs, { name: 'EU Nested', code: 'en', location: '/eu/nested' }];
    const { sourceLang } = resolveSourceLang({
      langs: nested,
      urls: ['/eu/nested/page'],
      defaultSourceLang,
    });
    expect(sourceLang.location).to.equal('/eu/nested');
  });

  it('names a locale-style root after the row that lists it', () => {
    const { sourceLang } = resolveSourceLang({
      langs,
      urls: ['/en-nl/shipping'],
      defaultSourceLang,
    });
    expect(sourceLang).to.deep.equal({ name: 'EU English (/en-nl)', code: 'en', location: '/en-nl' });
  });

  it('returns an error listing the roots when URLs are mixed', () => {
    const { error, sourceLang } = resolveSourceLang({
      langs,
      urls: ['/global/a', '/eu/b'],
      defaultSourceLang,
    });
    expect(sourceLang).to.equal(undefined);
    expect(error).to.include('/global');
    expect(error).to.include('/eu');
  });

  it('names the URLs outside the most common root in the mixed-root error', () => {
    const { error } = resolveSourceLang({
      langs,
      urls: ['/eu/a', '/eu/b', '/global/fragments/x', '/fragments/shared'],
      defaultSourceLang,
    });
    expect(error).to.include('To keep /eu, uncheck: /global/fragments/x.');
    expect(error).to.not.include('/eu/a,');
    expect(error).to.not.include('/fragments/shared');
  });

  it('caps the listed URLs in the mixed-root error', () => {
    const others = ['/global/1', '/global/2', '/global/3', '/global/4', '/global/5', '/global/6', '/global/7'];
    const { error } = resolveSourceLang({
      langs,
      urls: [...Array(8).keys()].map((i) => `/eu/${i}`).concat(others),
      defaultSourceLang,
    });
    expect(error).to.include('/global/5 and 2 more.');
    expect(error).to.not.include('/global/6');
  });

  it('falls back to the configured source when nothing matches', () => {
    const result = resolveSourceLang({ langs, urls: ['/unrelated/page'], defaultSourceLang });
    expect(result).to.deep.equal({ sourceLang: defaultSourceLang, detected: false });
  });

  it('matches whole folders only', () => {
    const result = resolveSourceLang({ langs, urls: ['/europe/page'], defaultSourceLang });
    expect(result.detected).to.equal(false);
  });

  it('matches the root itself and its .html / .json forms', () => {
    ['/eu', '/eu.html', '/eu.json', '/eu/'].forEach((path) => {
      const { sourceLang } = resolveSourceLang({ langs, urls: [path], defaultSourceLang });
      expect(sourceLang.location, path).to.equal('/eu');
    });
  });

  it('ignores URLs that match no root when the rest share one root', () => {
    const { sourceLang, error } = resolveSourceLang({
      langs,
      urls: ['/eu/page', '/fragments/header'],
      defaultSourceLang,
    });
    expect(error).to.equal(undefined);
    expect(sourceLang.location).to.equal('/eu');
  });

  it('reads suppliedPath and pathname from URL objects', () => {
    const { sourceLang } = resolveSourceLang({
      langs,
      urls: [{ suppliedPath: '/eu/a' }, { pathname: '/eu/b' }],
      defaultSourceLang,
    });
    expect(sourceLang.location).to.equal('/eu');
  });

  it('accepts locales already formatted as objects', () => {
    const formatted = [
      { name: 'EU English', code: 'en', location: '/eu', locales: [{ code: '/en-nl', active: true }] },
      { name: 'Dutch', code: 'nl', source: '/en-nl', location: '/nl-nl' },
    ];
    const { sourceLang } = resolveSourceLang({
      langs: formatted,
      urls: ['/en-nl/page'],
      defaultSourceLang,
    });
    expect(sourceLang.name).to.equal('EU English (/en-nl)');
  });

  it('does not treat a root of / as a match for everything', () => {
    const result = resolveSourceLang({
      langs: [{ name: 'Root', code: 'en', location: '/' }],
      urls: ['/anything'],
      defaultSourceLang: { name: 'Root', code: 'en', location: '/' },
    });
    expect(result.detected).to.equal(false);
  });
});

describe('isSourceDetectEnabled', () => {
  it('is true only for "true"', () => {
    expect(isSourceDetectEnabled('true')).to.equal(true);
    expect(isSourceDetectEnabled(' TRUE ')).to.equal(true);
    expect(isSourceDetectEnabled('false')).to.equal(false);
    expect(isSourceDetectEnabled(undefined)).to.equal(false);
  });
});

describe('normalizeLocation', () => {
  it('strips trailing slashes and defaults to /', () => {
    expect(normalizeLocation('/eu/')).to.equal('/eu');
    expect(normalizeLocation('')).to.equal('/');
    expect(normalizeLocation(undefined)).to.equal('/');
  });
});

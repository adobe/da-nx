import { expect } from '@esm-bundle/chai';
import { convertPath, getBasePath } from '../../nx/blocks/loc/utils/utils.js';

describe('convertPath', () => {
  it('joins destPrefix and the base path with exactly one slash, even when path has none removed', () => {
    // Regression: a caller (sendLanguageForTranslation) previously stripped
    // a root ('/') sourcePrefix by slicing 1 character off `path`, leaving
    // it without a leading slash. That squashed daDestPath/aemDestPath into
    // e.g. "/frtest-page.html" instead of "/fr/test-page.html".
    const paths = convertPath({ path: 'test-page', sourcePrefix: '/fr', destPrefix: '/fr' });

    expect(paths.daDestPath).to.equal('/fr/test-page.html');
    expect(paths.aemDestPath).to.equal('/fr/test-page');
  });

  it('still joins correctly when path already has a leading slash', () => {
    const paths = convertPath({ path: '/test-page', sourcePrefix: '/', destPrefix: '/fr' });

    expect(paths.daDestPath).to.equal('/fr/test-page.html');
    expect(paths.aemDestPath).to.equal('/fr/test-page');
  });

  it('normalizes a destPrefix with a trailing slash', () => {
    const paths = convertPath({ path: '/test-page', sourcePrefix: '/', destPrefix: '/fr/' });

    expect(paths.daDestPath).to.equal('/fr/test-page.html');
  });

  it('prepends a snapshot prefix to the joined dest path', () => {
    const paths = convertPath({
      path: 'test-page', sourcePrefix: '/fr', destPrefix: '/fr', snapshotPrefix: '/.snapshots/foo',
    });

    expect(paths.daDestPath).to.equal('/.snapshots/foo/fr/test-page.html');
  });

  it('leaves daBasePath/aemBasePath unaffected when no destPrefix is supplied', () => {
    const paths = convertPath({ path: '/test-page', sourcePrefix: '/' });

    expect(paths.daBasePath).to.equal('/test-page.html');
    expect(paths.aemBasePath).to.equal('/test-page');
    expect(paths.daDestPath).to.equal(undefined);
  });
});

describe('getBasePath', () => {
  it('returns the path unchanged when there is no prefix', () => {
    expect(getBasePath({ prefix: '', path: '/test-page' })).to.equal('/test-page');
  });

  it('strips a matching prefix', () => {
    expect(getBasePath({ prefix: '/en', path: '/en/test-page' })).to.equal('/test-page');
  });
});

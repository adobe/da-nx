import { expect } from '@esm-bundle/chai';

function convertUrl(path, srcLang, destLang) {
  const srcPath = path.startsWith(srcLang) ? path : `${srcLang}${path}`;
  const destSlash = srcLang === '/' ? '/' : '';
  const destPath = path.startsWith(srcLang) ? path.replace(srcLang, `${destLang}${destSlash}`) : `${destLang}${path}`;

  return { source: srcPath, destination: destPath };
}

describe('URL conversion', () => {
  it('Converts root URL to source language URL', () => {
    const url = convertUrl('/my-cool/path', '/en', '/fr');
    expect(url.source).to.equal('/en/my-cool/path');
    expect(url.destination).to.equal('/fr/my-cool/path');
  });

  it('Respects source language URL', () => {
    const url = convertUrl('/en/my-cool/path', '/en', '/fr');
    expect(url.source).to.equal('/en/my-cool/path');
    expect(url.destination).to.equal('/fr/my-cool/path');
  });

  it('Respects root language URL', () => {
    const url = convertUrl('/my-cool/path', '/', '/fr');
    expect(url.source).to.equal('/my-cool/path');
    expect(url.destination).to.equal('/fr/my-cool/path');
  });

  it('Respects root language page', () => {
    const url = convertUrl('/en', '/en', '/fr');
    expect(url.source).to.equal('/en');
    expect(url.destination).to.equal('/fr');
  });
});

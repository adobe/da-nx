import { expect } from '@esm-bundle/chai';
import { convertUrl } from '../../nx/blocks/loc/project/index.js';

describe('URL conversion', () => {
  it('Converts root URL to source language URL', () => {
    const url = convertUrl({
      path: '/my-cool/path',
      srcLang: '/en',
      destLang: '/fr',
    });
    expect(url.source).to.equal('/en/my-cool/path');
    expect(url.destination).to.equal('/fr/my-cool/path');
  });

  it('Respects source language URL', () => {
    const url = convertUrl({
      path: '/en/my-cool/path',
      srcLang: '/en',
      destLang: '/fr',
    });
    expect(url.source).to.equal('/en/my-cool/path');
    expect(url.destination).to.equal('/fr/my-cool/path');
  });

  it('Respects root language URL', () => {
    const url = convertUrl({
      path: '/my-cool/path',
      srcLang: '/',
      destLang: '/fr',
    });
    expect(url.source).to.equal('/my-cool/path');
    expect(url.destination).to.equal('/fr/my-cool/path');
  });

  it('Respects root language page', () => {
    const url = convertUrl({
      path: '/en',
      srcLang: '/en',
      destLang: '/fr',
    });
    expect(url.source).to.equal('/en');
    expect(url.destination).to.equal('/fr');
  });
});

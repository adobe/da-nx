import { expect } from '@esm-bundle/chai';
import { convertPath } from '../../../nx/blocks/loc/utils/url.js';

describe('URL conversion', () => {
  it('Converts base URL to source language URL', () => {
    const url = convertPath({
      path: '/my-cool/path',
      destPrefix: '/en',
    });
    expect(url.daPath).to.equal('/en/my-cool/path.html');
  });

  it('Converts base URL to source language URL w/ index', () => {
    const url = convertPath({
      path: '/my-cool/path/',
      destPrefix: '/en',
    });
    expect(url.daPath).to.equal('/en/my-cool/path/index.html');
  });

  it('Supports nameless prefix', () => {
    const url = convertPath({
      path: '/my-cool/path/',
      destPrefix: '/',
    });
    expect(url.daPath).to.equal('/my-cool/path/index.html');
  });

  it('Respects JSON', () => {
    const url = convertPath({
      path: '/my-cool/path.json',
      destPrefix: '/en',
    });
    expect(url.daPath).to.equal('/en/my-cool/path.json');
  });

  it('Handles no prefix', () => {
    const url = convertPath({
      path: '/my-cool/path',
    });
    expect(url.daPath).to.equal('/my-cool/path.html');
  });

  it('Respects pre-supplied language URL', () => {
    const url = convertPath({
      path: '/en/my-cool/path',
      destPrefix: '/en',
    });
    expect(url.daPath).to.equal('/en/my-cool/path.html');
  });

  it('Respects root language page with dest prefix', () => {
    const url = convertPath({
      path: '/en',
      destPrefix: '/en',
    });
    expect(url.daPath).to.equal('/en.html');
  });

  it('Respects root language page with dest prefix', () => {
    const url = convertPath({
      path: '/en',
      destPrefix: '/en',
    });
    expect(url.daPath).to.equal('/en.html');
  });

  it('Respects root language page with no name', () => {
    const url = convertPath({
      path: '',
      destPrefix: '/fr',
    });
    expect(url.daPath).to.equal('/fr.html');
  });

  // it('Respects root language page', () => {
  //   const url = convertUrl({
  //     path: '/en',
  //     srcLang: '/en',
  //     destLang: '/fr',
  //   });
  //   expect(url.source).to.equal('/en');
  //   expect(url.destination).to.equal('/fr');
  // });
});

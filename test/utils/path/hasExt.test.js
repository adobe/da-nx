import { expect } from '@esm-bundle/chai';
import { getExt } from '../../../nx/public/utils/getExt.js';

describe('Libs', () => {
  it('Does not have extension', () => {
    const ext = getExt('/my-cool/path');
    expect(!!ext).to.equal(false);
  });

  it('Slash does not have extension', () => {
    const ext = getExt('/my-cool/path/');
    expect(!!ext).to.equal(false);
  });

  it('Period mid path', () => {
    const ext = getExt('/my.cool/path/');
    expect(!!ext).to.equal(false);
  });

  it('Media extension', () => {
    const ext = getExt('/my.cool/path/hello.png');
    expect(ext).to.equal('png');
  });
});

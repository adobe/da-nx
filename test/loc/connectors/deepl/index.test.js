import { expect } from '@esm-bundle/chai';
import { toDeepLLanguageCode } from '../../../../nx/blocks/loc/connectors/deepl/index.js';

describe('deepl connector - toDeepLLanguageCode', () => {
  it('falls back to the static heuristic when no supported codes are provided', () => {
    expect(toDeepLLanguageCode('en', true)).to.equal('EN-US');
    expect(toDeepLLanguageCode('pt', true)).to.equal('PT-PT');
    expect(toDeepLLanguageCode('zh-CN', true)).to.equal('ZH-HANS');
    expect(toDeepLLanguageCode('fr-FR', false)).to.equal('FR');
  });

  it('resolves an exact match against the live supported set', () => {
    const supported = new Set(['EN-US', 'EN-GB', 'FR', 'DE']);
    expect(toDeepLLanguageCode('en-GB', true, supported)).to.equal('EN-GB');
    expect(toDeepLLanguageCode('de', true, supported)).to.equal('DE');
  });

  it('uses the variant hint table only when the live set confirms the variant exists', () => {
    const supported = new Set(['EN-US', 'EN-GB', 'PT-BR', 'PT-PT', 'ZH-HANS', 'ZH-HANT']);
    expect(toDeepLLanguageCode('en-UK', true, supported)).to.equal('EN-GB');
    expect(toDeepLLanguageCode('pt-PT', true, supported)).to.equal('PT-PT');
    expect(toDeepLLanguageCode('zh-TW', true, supported)).to.equal('ZH-HANT');
    expect(toDeepLLanguageCode('zh-CN', true, supported)).to.equal('ZH-HANS');
  });

  it('falls back to the bare base code when the live set has no matching variant', () => {
    const supported = new Set(['FR', 'DE', 'JA']);
    expect(toDeepLLanguageCode('fr-CA', true, supported)).to.equal('FR');
  });

  it('auto-selects a single live variant for a base with no hint entry', () => {
    const supported = new Set(['NB', 'ES-419']);
    expect(toDeepLLanguageCode('es-MX', true, supported)).to.equal('ES-419');
  });

  it('falls through to the static heuristic when the live set is empty', () => {
    expect(toDeepLLanguageCode('en', true, new Set())).to.equal('EN-US');
  });

  it('ignores supportedCodes for source-language resolution beyond exact/base match', () => {
    const supported = new Set(['EN', 'FR', 'DE']);
    expect(toDeepLLanguageCode('en-US', false, supported)).to.equal('EN');
  });
});

import { expect } from '@esm-bundle/chai';
import { decodeDisplayName } from '../../../nx/blocks/media-library/core/files.js';

describe('files', () => {
  describe('decodeDisplayName', () => {
    it('returns falsy input unchanged', () => {
      expect(decodeDisplayName(null)).to.equal(null);
      expect(decodeDisplayName(undefined)).to.equal(undefined);
      expect(decodeDisplayName('')).to.equal('');
    });

    it('decodes single-encoded name', () => {
      const encoded = 'hello%20world';
      const result = decodeDisplayName(encoded);
      expect(result).to.equal('hello world');
    });

    it('decodes double-encoded name', () => {
      const doubleEncoded = 'hello%2520world';
      const result = decodeDisplayName(doubleEncoded);
      expect(result).to.equal('hello world');
    });

    it('decodes triple-encoded name', () => {
      const tripleEncoded = 'hello%252520world';
      const result = decodeDisplayName(tripleEncoded);
      expect(result).to.equal('hello world');
    });

    it('stops at maxIterations of 3', () => {
      const quadEncoded = encodeURIComponent(encodeURIComponent(encodeURIComponent(encodeURIComponent('test'))));
      const result = decodeDisplayName(quadEncoded);
      expect(result).to.equal('test');
    });

    it('handles already decoded name', () => {
      const plainName = 'hello world';
      const result = decodeDisplayName(plainName);
      expect(result).to.equal('hello world');
    });

    it('handles special characters', () => {
      const encoded = 'file%20with%20%26%20ampersand';
      const result = decodeDisplayName(encoded);
      expect(result).to.equal('file with & ampersand');
    });

    it('handles unicode characters', () => {
      const encoded = '%E4%BD%A0%E5%A5%BD';
      const result = decodeDisplayName(encoded);
      expect(result).to.equal('你好');
    });

    it('handles malformed encoding gracefully', () => {
      const malformed = 'hello%world';
      const result = decodeDisplayName(malformed);
      expect(result).to.equal('hello%world');
    });

    it('stops decoding when value stabilizes', () => {
      const encoded = 'hello%20world';
      const result = decodeDisplayName(encoded);
      expect(result).to.equal('hello world');
    });

    it('handles mixed encoded and plain text', () => {
      const mixed = 'hello%20world-test';
      const result = decodeDisplayName(mixed);
      expect(result).to.equal('hello world-test');
    });

    it('handles percent sign in decoded content', () => {
      const encoded = '100%25%20complete';
      const result = decodeDisplayName(encoded);
      expect(result).to.equal('100% complete');
    });

    it('returns last valid state on decode error', () => {
      const partiallyValid = 'valid%20text%E';
      const result = decodeDisplayName(partiallyValid);
      expect(result).to.be.a('string');
    });
  });
});

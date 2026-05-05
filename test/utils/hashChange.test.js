import { expect } from '@esm-bundle/chai';
import { hashChange } from '../../nx/utils/utils.js';

function withHash(hash, fn) {
  const original = window.location.hash;
  window.location.hash = hash;
  try {
    return fn();
  } finally {
    window.location.hash = original;
  }
}

describe('hashChange', () => {
  describe('subscribe immediate call', () => {
    it('returns null for IMS OAuth access_token hash', () => {
      let received;
      withHash('#access_token=eyJhbGciOiJSUzI1NiIsIng1dSI6Imltc19uYTEta2V5In0', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.be.null;
    });

    it('returns null for old_hash IMS fragment', () => {
      let received;
      withHash('#old_hash=%23%2Forg%2Frepo', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.be.null;
    });

    it('returns null for empty hash', () => {
      let received;
      withHash('', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.be.null;
    });

    it('returns pathDetails for a valid org/repo hash', () => {
      let received;
      withHash('#/myorg/myrepo', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.not.be.null;
      expect(received.org).to.equal('myorg');
      expect(received.site).to.equal('myrepo');
    });

    it('returns pathDetails for a valid org/repo/path hash', () => {
      let received;
      withHash('#/myorg/myrepo/some/deep/path', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.not.be.null;
      expect(received.org).to.equal('myorg');
      expect(received.site).to.equal('myrepo');
      expect(received.path).to.equal('some/deep/path');
    });

    it('returns null for hash without leading slash', () => {
      let received;
      withHash('#noslash', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.be.null;
    });
  });
});

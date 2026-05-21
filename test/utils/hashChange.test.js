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

function withPathname(pathname, fn) {
  const original = window.location.pathname;
  history.pushState(null, '', pathname);
  try {
    return fn();
  } finally {
    history.pushState(null, '', original);
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

    it('returns pathDetails for a valid org/repo hash and removes IMS access_token hash', () => {
      let received;
      withHash('#/myorg/myrepo#access_token=eyJhbGciOiJSUzI1NiIsIng1dSI6Imltc19uYTEta2V5In0', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.not.be.null;
      expect(received.org).to.equal('myorg');
      expect(received.site).to.equal('myrepo');
    });

    it('returns pathDetails for a valid org/repo hash and removes IMS old_hash hash', () => {
      let received;
      withHash('#/myorg/myrepo#old_hash=eyJhbGciOiJSUzI1NiIsIng1dSI6Imltc19uYTEta2V5In0', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.not.be.null;
      expect(received.org).to.equal('myorg');
      expect(received.site).to.equal('myrepo');
    });

    it('returns pathDetails for a valid org/repo hash and removes IMS ld_hash hash', () => {
      let received;
      withHash('#/myorg/myrepo#ld_hash=eyJhbGciOiJSUzI1NiIsIng1dSI6Imltc19uYTEta2V5In0', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.not.be.null;
      expect(received.org).to.equal('myorg');
      expect(received.site).to.equal('myrepo');
    });

    it('returns pathDetails for a valid org/repo hash and removes multiple IMS hashes', () => {
      let received;
      withHash('#/myorg/myrepo#access_token=eyJhbGciOiJSUzI1NiIsIng1dSI6Imltc19uYTEta2V5In0#old_hash=iuweyrwre', () => {
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

    it('returns pathDetails for org/repo hash with trailing slash', () => {
      let received;
      withHash('#/myorg/myrepo/', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.not.be.null;
      expect(received.org).to.equal('myorg');
      expect(received.site).to.equal('myrepo');
    });

    it('returns pathDetails for org/repo/path hash with trailing slash', () => {
      let received;
      withHash('#/myorg/myrepo/some/deep/path/', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.not.be.null;
      expect(received.org).to.equal('myorg');
      expect(received.site).to.equal('myrepo');
      expect(received.path).to.equal('some/deep/path');
    });

    it('returns pathDetails for org-only hash with trailing slash', () => {
      let received;
      withHash('#/myorg/', () => {
        const unsub = hashChange.subscribe((details) => { received = details; });
        unsub();
      });
      expect(received).to.not.be.null;
      expect(received.org).to.equal('myorg');
      expect(received.site).to.be.null;
    });

    it('does not strip trailing slash when view is config', () => {
      let received;
      withPathname('/config', () => {
        withHash('#/myorg/myrepo/', () => {
          const unsub = hashChange.subscribe((details) => { received = details; });
          unsub();
        });
      });
      expect(received).to.not.be.null;
      expect(received.org).to.equal('myorg');
      expect(received.site).to.equal('myrepo');
      expect(received.fullpath.endsWith('/')).to.be.true;
    });
  });
});

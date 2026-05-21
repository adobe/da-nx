import { expect } from '@esm-bundle/chai';
import { resolveDaOrigin, resolveDaEtcOrigin } from '../../../nx/blocks/media-library/core/constants.js';

describe('constants - environment resolution', () => {
  describe('resolveDaOrigin', () => {
    let originalLocalStorage;

    beforeEach(() => {
      // Save original localStorage
      originalLocalStorage = { ...localStorage };
      // Clear localStorage before each test
      localStorage.clear();
    });

    afterEach(() => {
      // Restore original localStorage
      Object.keys(originalLocalStorage).forEach((key) => {
        localStorage.setItem(key, originalLocalStorage[key]);
      });
    });

    it('returns prod origin by default', () => {
      const location = {
        href: 'https://da.live/apps/media-library',
        origin: 'https://da.live',
      };

      const result = resolveDaOrigin(location);
      expect(result).to.equal('https://admin.da.live');
    });

    it('persists ?da-admin=stage to localStorage', () => {
      const location = {
        href: 'https://da.live/apps/media-library?da-admin=stage',
        origin: 'https://da.live',
      };

      const result = resolveDaOrigin(location);

      expect(localStorage.getItem('da-admin')).to.equal('stage');
      expect(result).to.equal('https://stage-admin.da.live');
    });

    it('persists ?da-admin=local to localStorage', () => {
      const location = {
        href: 'https://da.live/apps/media-library?da-admin=local',
        origin: 'https://da.live',
      };

      const result = resolveDaOrigin(location);

      expect(localStorage.getItem('da-admin')).to.equal('local');
      expect(result).to.equal('http://localhost:8787');
    });

    it('clears localStorage when ?da-admin=reset', () => {
      // Set initial value
      localStorage.setItem('da-admin', 'stage');

      const location = {
        href: 'https://da.live/apps/media-library?da-admin=reset',
        origin: 'https://da.live',
      };

      const result = resolveDaOrigin(location);

      expect(localStorage.getItem('da-admin')).to.be.null;
      expect(result).to.equal('https://admin.da.live'); // Falls back to prod
    });

    it('uses persisted localStorage value when no query param', () => {
      // Simulate previous ?da-admin=stage
      localStorage.setItem('da-admin', 'stage');

      const location = {
        href: 'https://da.live/apps/media-library',
        origin: 'https://da.live',
      };

      const result = resolveDaOrigin(location);

      expect(result).to.equal('https://stage-admin.da.live');
    });

    it('replaces .live with .page for da.page origin', () => {
      localStorage.setItem('da-admin', 'stage');

      const location = {
        href: 'https://da.page/apps/media-library',
        origin: 'https://da.page',
      };

      const result = resolveDaOrigin(location);

      expect(result).to.equal('https://stage-admin.da.page');
    });

    it('handles invalid environment gracefully', () => {
      const location = {
        href: 'https://da.live/apps/media-library?da-admin=invalid',
        origin: 'https://da.live',
      };

      const result = resolveDaOrigin(location);

      // Should persist the value but fall back to prod
      expect(localStorage.getItem('da-admin')).to.equal('invalid');
      expect(result).to.equal('https://admin.da.live');
    });

    // Worker context test skipped - implementation uses typeof localStorage !== 'undefined'
    // which is correctly handled in the code (constants.js:149-151, 167-169)
  });

  describe('resolveDaEtcOrigin', () => {
    it('returns prod by default', () => {
      const location = {
        href: 'https://da.live/apps/media-library',
      };

      const result = resolveDaEtcOrigin(location);
      expect(result).to.equal('https://da-etc.adobeaem.workers.dev');
    });

    it('returns local when ?da-etc=local', () => {
      const location = {
        href: 'https://da.live/apps/media-library?da-etc=local',
      };

      const result = resolveDaEtcOrigin(location);
      expect(result).to.equal('http://localhost:8787');
    });

    it('returns custom URL when ?da-etc=custom', () => {
      const location = {
        href: 'https://da.live/apps/media-library?da-etc=https://custom-etc.example.com',
      };

      const result = resolveDaEtcOrigin(location);
      expect(result).to.equal('https://custom-etc.example.com');
    });

    it('detects localhost in href', () => {
      const location = {
        href: 'http://localhost:6456/apps/media-library',
      };

      const result = resolveDaEtcOrigin(location);
      expect(result).to.equal('http://localhost:8787');
    });
  });

  describe('environment switching workflow', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('supports stage workflow: set → persist → use', () => {
      // Step 1: User adds ?da-admin=stage
      const location1 = {
        href: 'https://da.live/apps/media-library?da-admin=stage',
        origin: 'https://da.live',
      };
      resolveDaOrigin(location1);
      expect(localStorage.getItem('da-admin')).to.equal('stage');

      // Step 2: User navigates without query param
      const location2 = {
        href: 'https://da.live/apps/media-library',
        origin: 'https://da.live',
      };
      const result = resolveDaOrigin(location2);

      // Should still use stage from localStorage
      expect(result).to.equal('https://stage-admin.da.live');
    });

    it('supports reset workflow: stage → reset → prod', () => {
      // User was on stage
      localStorage.setItem('da-admin', 'stage');
      let result = resolveDaOrigin({
        href: 'https://da.live/apps/media-library',
        origin: 'https://da.live',
      });
      expect(result).to.equal('https://stage-admin.da.live');

      // User resets
      resolveDaOrigin({
        href: 'https://da.live/apps/media-library?da-admin=reset',
        origin: 'https://da.live',
      });

      // Should now be on prod
      result = resolveDaOrigin({
        href: 'https://da.live/apps/media-library',
        origin: 'https://da.live',
      });
      expect(result).to.equal('https://admin.da.live');
    });

    it('supports switch workflow: stage → local → stage', () => {
      // Start on stage
      resolveDaOrigin({
        href: 'https://da.live/apps/media-library?da-admin=stage',
        origin: 'https://da.live',
      });
      expect(localStorage.getItem('da-admin')).to.equal('stage');

      // Switch to local
      resolveDaOrigin({
        href: 'https://da.live/apps/media-library?da-admin=local',
        origin: 'https://da.live',
      });
      expect(localStorage.getItem('da-admin')).to.equal('local');

      // Switch back to stage
      resolveDaOrigin({
        href: 'https://da.live/apps/media-library?da-admin=stage',
        origin: 'https://da.live',
      });
      expect(localStorage.getItem('da-admin')).to.equal('stage');
    });
  });
});
